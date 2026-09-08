import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { fileTypeFromBuffer } from 'file-type';
import { Client } from 'pg';
import sharp from 'sharp';
import { z } from 'zod';
import { Prisma, PrismaClient, type MediaAsset } from '../src/generated/prisma/client.js';
import {
  contentToMarkdown,
  dateAtUtc,
  preflightFrontendMedia,
  readFrontendData,
  skillIconKey,
  tagSlug,
  type FrontendData,
  type SourceMedia,
} from './frontend-source.js';

const importEnvironment = z.object({
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  MEDIA_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
});

export interface ImportReport {
  articles: number;
  categories: number;
  tags: number;
  books: number;
  games: number;
  photos: number;
  skills: number;
  socialLinks: number;
  mediaReferences: number;
  uploaded: number;
  reused: number;
}

interface PreparedMedia {
  source: SourceMedia;
  buffer: Buffer;
  width: number;
  height: number;
}

async function prepareMedia(source: SourceMedia, maxBytes: number): Promise<PreparedMedia> {
  const buffer = await readFile(source.path);
  if (buffer.length > maxBytes)
    throw new Error(`${source.sourcePath}: exceeds MEDIA_MAX_UPLOAD_BYTES (${maxBytes})`);
  const type = await fileTypeFromBuffer(buffer);
  const extension = extname(source.path).toLowerCase();
  const extensionMatches =
    type &&
    ((type.mime === 'image/jpeg' && ['.jpg', '.jpeg'].includes(extension)) ||
      (type.mime === 'image/png' && extension === '.png') ||
      (type.mime === 'image/webp' && extension === '.webp'));
  if (!extensionMatches)
    throw new Error(`${source.sourcePath}: extension and supported image signature do not match`);
  const dimension = source.kind === 'PHOTO_THUMBNAIL' ? 640 : 2560;
  const output = await sharp(buffer, { failOn: 'error', limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: dimension, height: dimension, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: source.kind === 'PHOTO_THUMBNAIL' ? 80 : 90 })
    .toBuffer({ resolveWithObject: true });
  return { source, buffer: output.data, width: output.info.width, height: output.info.height };
}

async function existingReferences(
  prisma: PrismaClient,
  data: FrontendData,
): Promise<Map<string, MediaAsset>> {
  const [articles, books, games, photos] = await Promise.all([
    prisma.article.findMany({
      where: { id: { in: data.articles.map((row) => row.id) } },
      include: { coverMedia: true },
    }),
    prisma.book.findMany({
      where: { id: { in: data.books.map((row) => row.id) } },
      include: { coverMedia: true },
    }),
    prisma.game.findMany({
      where: { id: { in: data.games.map((row) => row.id) } },
      include: { coverMedia: true },
    }),
    prisma.photo.findMany({
      where: { id: { in: data.photos.map((row) => row.id) } },
      include: { originalMedia: true, thumbnailMedia: true },
    }),
  ]);
  const references = new Map<string, MediaAsset>();
  for (const row of articles) references.set(`article:${row.id}`, row.coverMedia);
  for (const row of books) references.set(`book:${row.id}`, row.coverMedia);
  for (const row of games) references.set(`game:${row.id}`, row.coverMedia);
  for (const row of photos) {
    references.set(`photo-original:${row.id}`, row.originalMedia);
    references.set(`photo-thumbnail:${row.id}`, row.thumbnailMedia);
  }
  return references;
}

function requiredMedia(ids: ReadonlyMap<string, number>, reference: string): number {
  const id = ids.get(reference);
  if (id === undefined) throw new Error(`No imported media ID for ${reference}`);
  return id;
}

async function writeBusinessData(
  tx: Prisma.TransactionClient,
  data: FrontendData,
  media: ReadonlyMap<string, number>,
): Promise<void> {
  const categoryIds = new Map<string, number>();
  for (const [index, category] of data.categories.entries()) {
    const fields = {
      key: category.key,
      label: category.label,
      iconKey: category.icon,
      sortOrder: index,
      isVisible: true,
    };
    const row = await tx.category.upsert({
      where: { id: index + 1 },
      create: { id: index + 1, ...fields },
      update: fields,
    });
    categoryIds.set(category.key, row.id);
  }
  const tagIds = new Map<string, number>();
  for (const name of new Set(data.articles.flatMap((article) => article.tags))) {
    const row = await tx.tag.upsert({
      where: { name },
      create: { name, slug: tagSlug(name) },
      update: {},
    });
    tagIds.set(name, row.id);
  }
  for (const article of data.articles) {
    const categoryId = categoryIds.get(article.category);
    if (categoryId === undefined) throw new Error(`Unknown category ${article.category}`);
    const fields = {
      slug: `article-${article.id}`,
      title: article.title,
      summary: article.summary,
      bodyMarkdown: contentToMarkdown(article.content),
      categoryId,
      coverMediaId: requiredMedia(media, `article:${article.id}`),
      status: 'PUBLISHED' as const,
      publishedAt: dateAtUtc(article.date),
      readingTimeMinutes: Math.max(
        3,
        Math.ceil(article.content.join('').replace(/<[^>]+>/g, '').length / 260),
      ),
      seoTitle: null,
      seoDescription: null,
    };
    await tx.article.upsert({
      where: { id: article.id },
      create: { id: article.id, ...fields },
      update: fields,
    });
    await tx.articleTag.deleteMany({ where: { articleId: article.id } });
    for (const name of new Set(article.tags)) {
      const tagId = tagIds.get(name);
      if (tagId === undefined) throw new Error(`Unknown tag ${name}`);
      await tx.articleTag.create({ data: { articleId: article.id, tagId } });
    }
  }
  for (const [sortOrder, book] of data.books.entries()) {
    const fields = {
      title: book.title,
      author: book.author,
      accent: book.accent,
      coverMediaId: requiredMedia(media, `book:${book.id}`),
      sourceName: book.sourceName === 'xx' ? null : book.sourceName,
      sourceUrl: book.sourceUrl === '#' ? null : book.sourceUrl,
      readingOrder: book.readingOrder,
      lastReadAt: dateAtUtc(book.readingTime),
      startedAt: dateAtUtc(book.startedAt),
      finishedAt: dateAtUtc(book.finishedAt),
      progress: book.progress,
      sortOrder,
      isVisible: true,
    };
    await tx.book.upsert({
      where: { id: book.id },
      create: { id: book.id, ...fields },
      update: fields,
    });
  }
  for (const [sortOrder, game] of data.games.entries()) {
    const fields = {
      title: game.title,
      platform: game.platform ?? null,
      coverMediaId: requiredMedia(media, `game:${game.id}`),
      rating: game.rating,
      playtimeHours: game.playtimeHours,
      likeLevel: game.likeLevel,
      comment: game.comment === '暂无评价' ? null : game.comment,
      sortOrder,
      isVisible: true,
    };
    await tx.game.upsert({
      where: { id: game.id },
      create: { id: game.id, ...fields },
      update: fields,
    });
  }
  for (const [sortOrder, photo] of data.photos.entries()) {
    const fields = {
      originalMediaId: requiredMedia(media, `photo-original:${photo.id}`),
      thumbnailMediaId: requiredMedia(media, `photo-thumbnail:${photo.id}`),
      alt: photo.alt,
      title: photo.title,
      description: photo.description,
      capturedAt: null,
      sortOrder,
      isVisible: true,
    };
    await tx.photo.upsert({
      where: { id: photo.id },
      create: { id: photo.id, ...fields },
      update: fields,
    });
  }
  for (const [sortOrder, skill] of data.skills.entries()) {
    const fields = {
      name: skill.name,
      iconKey: skillIconKey(skill.image),
      sortOrder,
      isVisible: true,
    };
    await tx.skill.upsert({
      where: { id: sortOrder + 1 },
      create: { id: sortOrder + 1, ...fields },
      update: fields,
    });
  }
  for (const [sortOrder, social] of data.socials.entries()) {
    const hostname = new URL(social.url).hostname;
    const platform = hostname === 'www.douyin.com' ? 'douyin' : social.name.toLowerCase();
    const fields = {
      name: social.name,
      url: social.url,
      platform,
      iconKey: social.icon,
      sortOrder,
      isVisible: true,
    };
    await tx.socialLink.upsert({
      where: { id: sortOrder + 1 },
      create: { id: sortOrder + 1, ...fields },
      update: fields,
    });
  }
  await tx.siteProfile.upsert({
    where: { id: 1 },
    create: { id: 1, ...data.profile },
    update: data.profile,
  });
  // Identifiers are a closed compile-time list, never frontend or CLI input.
  for (const table of [
    'categories',
    'tags',
    'articles',
    'books',
    'games',
    'photos',
    'skills',
    'social_links',
    'media_assets',
  ] as const) {
    await tx.$queryRaw(
      Prisma.sql`SELECT setval(pg_get_serial_sequence(${table}, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${Prisma.raw(`"${table}"`)}`,
    );
  }
}

/** Imports fixed original IDs. Repeat runs refresh text and reuse already-referenced media. */
export async function importFrontend(sourceRoot: string): Promise<ImportReport> {
  const data = await readFrontendData(sourceRoot);
  const sources = await preflightFrontendMedia(sourceRoot, data);
  const config = importEnvironment.parse(process.env);
  // Validate and decode every image before creating any external object or database row.
  const prepared: PreparedMedia[] = [];
  const invalid: string[] = [];
  for (const source of sources) {
    try {
      prepared.push(await prepareMedia(source, config.MEDIA_MAX_UPLOAD_BYTES));
    } catch (error: unknown) {
      invalid.push(
        `${source.reference}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (invalid.length)
    throw new Error(`Image validation failed. Nothing was written:\n${invalid.join('\n')}`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
  });
  const lock = new Client({ connectionString: config.DATABASE_URL });
  const s3 = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
  const uploaded: { image: PreparedMedia; objectKey: string }[] = [];
  let committed = false;
  try {
    await lock.connect();
    const result = await lock.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(174812, 7631) AS locked',
    );
    if (!result.rows[0]?.locked)
      throw new Error('Another frontend import is running against this database');
    const existing = await existingReferences(prisma, data);
    const ids = new Map([...existing.entries()].map(([reference, asset]) => [reference, asset.id]));
    for (const image of prepared) {
      const asset = existing.get(image.source.reference);
      if (asset) {
        // A repeated import must not silently retain a dead URL.
        await s3
          .send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: asset.objectKey }))
          .catch((error: unknown) => {
            throw new Error(
              `Existing media ${asset.id} (${image.source.reference}) is unavailable in storage; restore the object before retrying`,
              { cause: error },
            );
          });
        continue;
      }
      const objectKey = `media/import/${randomUUID()}.webp`;
      // Track attempted uploads too: a transport error can occur after storage accepted the object.
      uploaded.push({ image, objectKey });
      await s3.send(
        new PutObjectCommand({
          Bucket: config.S3_BUCKET,
          Key: objectKey,
          Body: image.buffer,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    }
    await prisma.$transaction(
      async (tx) => {
        for (const { image, objectKey } of uploaded) {
          const asset = await tx.mediaAsset.create({
            data: {
              objectKey,
              mimeType: 'image/webp',
              sizeBytes: image.buffer.length,
              width: image.width,
              height: image.height,
              altText: image.source.altText,
              kind: image.source.kind,
            },
          });
          ids.set(image.source.reference, asset.id);
        }
        await writeBusinessData(tx, data, ids);
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
    committed = true;
    return {
      articles: data.articles.length,
      categories: data.categories.length,
      tags: new Set(data.articles.flatMap((article) => article.tags)).size,
      books: data.books.length,
      games: data.games.length,
      photos: data.photos.length,
      skills: data.skills.length,
      socialLinks: data.socials.length,
      mediaReferences: sources.length,
      uploaded: uploaded.length,
      reused: existing.size,
    };
  } catch (error: unknown) {
    if (!committed) {
      const cleanup = await Promise.allSettled(
        uploaded.map(({ objectKey }) =>
          s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: objectKey })),
        ),
      );
      const failed = cleanup.flatMap((result, index) =>
        result.status === 'rejected' ? [uploaded[index]?.objectKey ?? 'unknown'] : [],
      );
      if (failed.length)
        throw new Error(
          `Import failed; object cleanup also failed. Remove these orphan keys after resolving storage connectivity: ${failed.join(', ')}`,
          { cause: error },
        );
    }
    throw error;
  } finally {
    await Promise.allSettled([lock.end(), prisma.$disconnect()]);
    s3.destroy();
  }
}

export function parseImportArguments(args: readonly string[]): { source: string; check: boolean } {
  const argumentsOnly = args.filter((argument) => argument !== '--');
  const sourceIndex = argumentsOnly.indexOf('--source');
  const source = argumentsOnly[sourceIndex + 1];
  if (sourceIndex < 0 || source === undefined || source.startsWith('--')) {
    throw new Error(
      'Usage: pnpm import:frontend -- --source "<extracted-static-source>" [--check]',
    );
  }
  const remaining = argumentsOnly.filter(
    (_argument, index) => index !== sourceIndex && index !== sourceIndex + 1,
  );
  if (remaining.some((argument) => argument !== '--check') || remaining.length > 1)
    throw new Error('Unknown or duplicate import argument');
  return { source: resolve(source), check: remaining.includes('--check') };
}

async function main(): Promise<void> {
  const options = parseImportArguments(process.argv.slice(2));
  if (options.check) {
    const data = await readFrontendData(options.source);
    const media = await preflightFrontendMedia(options.source, data);
    console.log(
      JSON.stringify(
        {
          source: options.source,
          media: media.length,
          counts: {
            articles: data.articles.length,
            categories: data.categories.length,
            books: data.books.length,
            games: data.games.length,
            photos: data.photos.length,
            skills: data.skills.length,
            socialLinks: data.socials.length,
          },
          profile: data.profile,
          status: 'Source and paths verified; no writes performed',
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log('Importing original frontend IDs; matching business records will be refreshed.');
  console.log(JSON.stringify(await importFrontend(options.source), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Frontend import failed');
    process.exitCode = 1;
  });
}

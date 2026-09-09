import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { configureTestEnvironment, deployTestMigrations } from './support/test-environment.js';

let prisma: PrismaClient;
let sql: Pool;
let s3: S3Client;
let bucket: string;
const sourcePath = process.env.FRONTEND_SOURCE_PATH;
if (!sourcePath?.trim()) {
  throw new Error(
    'FRONTEND_SOURCE_PATH is required: point it at the extracted static import archive. The current blog no longer contains migration data.',
  );
}
const source = resolve(sourcePath);
if (!existsSync(resolve(source, 'src/data/articles.ts'))) {
  throw new Error(
    'FRONTEND_SOURCE_PATH must contain src/data/articles.ts; no test database setup was started.',
  );
}

async function clean(): Promise<void> {
  const assets = await prisma.mediaAsset.findMany({ select: { objectKey: true } });
  for (const asset of assets)
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.objectKey }));
  await sql.query(
    'TRUNCATE article_tags, articles, books, games, photos, site_profiles, categories, tags, skills, social_links, media_assets, admin_sessions, admin_users, login_throttles RESTART IDENTITY CASCADE',
  );
}

beforeAll(async () => {
  const databaseUrl = configureTestEnvironment();
  process.env.MEDIA_MAX_UPLOAD_BYTES = String(10 * 1024 * 1024);
  await deployTestMigrations();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  sql = new Pool({ connectionString: databaseUrl });
  bucket = z.string().parse(process.env.S3_BUCKET);
  s3 = new S3Client({
    endpoint: z.string().parse(process.env.S3_ENDPOINT),
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: z.string().parse(process.env.S3_ACCESS_KEY_ID),
      secretAccessKey: z.string().parse(process.env.S3_SECRET_ACCESS_KEY),
    },
  });
  await clean();
});

afterAll(async () => {
  if (prisma && sql && s3) await clean();
  if (prisma) await prisma.$disconnect();
  if (sql) await sql.end();
  if (s3) s3.destroy();
});

it('imports the actual frontend twice without duplicate records or media, preserving data and sequences', async () => {
  const { importFrontend } = await import('../scripts/import-frontend.js');
  const first = await importFrontend(source);
  expect(first).toMatchObject({
    articles: 6,
    categories: 6,
    tags: 11,
    books: 3,
    games: 47,
    photos: 10,
    skills: 24,
    socialLinks: 3,
    uploaded: 76,
  });
  const before = await prisma.mediaAsset.findMany({ orderBy: { id: 'asc' } });
  const second = await importFrontend(source);
  expect(second).toMatchObject({ uploaded: 0, reused: 76 });
  expect(await prisma.mediaAsset.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  const counts = await prisma.$transaction([
    prisma.article.count(),
    prisma.category.count(),
    prisma.tag.count(),
    prisma.book.count(),
    prisma.game.count(),
    prisma.photo.count(),
    prisma.skill.count(),
    prisma.socialLink.count(),
    prisma.mediaAsset.count(),
  ]);
  expect(counts).toEqual([6, 6, 11, 3, 47, 10, 24, 3, 76]);
  expect(await prisma.adminUser.count()).toBe(0);
  const articles = await prisma.article.findMany({
    orderBy: { id: 'asc' },
    include: { coverMedia: true },
  });
  expect(articles.map((article) => article.id)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(new Set(articles.map((article) => article.coverMediaId)).size).toBe(6);
  expect(articles[0]?.bodyMarkdown).toContain('`<script setup>`');
  expect(articles[0]?.bodyMarkdown).not.toContain('<code>');
  const game = await prisma.game.findUniqueOrThrow({ where: { id: 6 } });
  expect(game).toMatchObject({ playtimeHours: 1380, likeLevel: 5, platform: null });
  expect(Number(game.rating)).toBe(0);
  expect(await prisma.book.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject({
    progress: 0,
    sourceName: null,
    sourceUrl: null,
  });
  const skill = await prisma.skill.create({
    data: { name: 'After import', iconKey: 'after-import' },
  });
  expect(skill.id).toBe(25);
  const added = await prisma.article.create({
    data: {
      slug: 'after-import',
      title: 'After import',
      summary: 'Sequence verification',
      bodyMarkdown: 'test',
      categoryId: z.number().parse(articles[0]?.categoryId),
      coverMediaId: z.number().parse(articles[0]?.coverMediaId),
      readingTimeMinutes: 1,
    },
  });
  expect(added.id).toBe(7);
}, 120_000);

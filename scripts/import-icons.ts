import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import sharp from 'sharp';
import { validateEnvironment } from '../src/config/environment.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { parseFrontendLiteral, skillIconKey } from './frontend-source.js';
import { z } from 'zod';

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((value) => value !== '--');
  const sourceIndex = args.indexOf('--source');
  if (sourceIndex < 0 || !args[sourceIndex + 1])
    throw new Error('Usage: pnpm import:icons -- --source <blog-directory> [--check]');
  const root = resolve(args[sourceIndex + 1]!);
  const allowedArgs = args.filter(
    (_value, index) => index !== sourceIndex && index !== sourceIndex + 1,
  );
  if (allowedArgs.some((value) => value !== '--check') || allowedArgs.length > 1)
    throw new Error('Unknown arguments');
  const source = await readFile(resolve(root, 'src/data/skills.ts'), 'utf8');
  const skills = z
    .array(z.object({ name: z.string(), image: z.string(), darkImage: z.string().optional() }))
    .parse(parseFrontendLiteral(source, 'skillIconPlaceholders'));
  const paths = new Map(
    skills.map((skill) => [
      skillIconKey(skill.image),
      { light: skill.image, dark: skill.darkImage },
    ]),
  );
  for (const key of ['github', 'x-formerly-twitter', 'tiktok'])
    paths.set(key, {
      light: `/images/icons/${key}-light.svg`,
      dark: `/images/icons/${key}-dark.svg`,
    });
  const prepared = new Map<
    string,
    { buffer: Buffer; width: number; height: number; objectKey: string }
  >();
  const iconsRoot = await realpath(resolve(root, 'public/images/icons'));
  for (const pair of paths.values()) {
    for (const file of [pair.light, pair.dark]) {
      if (!file || prepared.has(file)) continue;
      const actual = await realpath(resolve(root, 'public', `.${file}`));
      const child = relative(iconsRoot, actual);
      if (isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`))
        throw new Error('Icon path escapes the source icon directory');
      // These are explicit local migration sources, never arbitrary remote SVG URLs.
      const input = await readFile(actual);
      if (input.length > 1024 * 1024) throw new Error('Source icon exceeds 1 MiB');
      const { data, info } = await sharp(input, {
        density: 72,
        limitInputPixels: 16_000_000,
        failOn: 'error',
      })
        .resize({ width: 512, height: 512, fit: 'inside' })
        .webp({ lossless: true })
        .toBuffer({ resolveWithObject: true });
      prepared.set(file, {
        buffer: data,
        width: info.width,
        height: info.height,
        objectKey: `media/icons/import/${createHash('sha256').update(data).digest('hex')}.webp`,
      });
    }
  }
  if (allowedArgs.includes('--check')) {
    console.log(`Validated and decoded ${prepared.size} local icons; no writes performed.`);
    return;
  }
  const config = new AppConfigService(new ConfigService(validateEnvironment(process.env)));
  const prisma = new PrismaService(config);
  const lock = new Client({ connectionString: config.databaseUrl });
  let changed = 0;
  try {
    await lock.connect();
    const claim = await lock.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(174812, 7632) AS locked',
    );
    if (!claim.rows[0]?.locked) throw new Error('Another icon import is running');
    for (const resource of ['skill', 'socialLink'] as const) {
      const records =
        resource === 'skill' ? await prisma.skill.findMany() : await prisma.socialLink.findMany();
      for (const record of records) {
        const pair = paths.get(record.iconKey);
        if (!pair) continue;
        for (const [field, file] of [
          ['iconMediaId', pair.light],
          ['darkIconMediaId', pair.dark],
        ] as const) {
          if (record[field] !== null || !file) continue;
          const image = prepared.get(file);
          if (!image) throw new Error('Missing prepared icon');
          // Content-addressed media IDs remain compatible; image bytes now live in PostgreSQL.
          await prisma.$transaction(async (tx) => {
              const asset = await tx.mediaAsset.upsert({
                where: { objectKey: image.objectKey },
                update: {},
                create: {
                  objectKey: image.objectKey,
                  mimeType: 'image/webp',
                  sizeBytes: image.buffer.length,
                  width: image.width,
                  height: image.height,
                  kind: 'IMAGE',
                  altText: `${record.name} icon`,
                },
              });
              await tx.mediaContent.upsert({
                where: { mediaId: asset.id },
                create: {
                  mediaId: asset.id,
                  bytes: Uint8Array.from(image.buffer),
                  sha256: createHash('sha256').update(image.buffer).digest('hex'),
                },
                update: {},
              });
              await tx.mediaAsset.update({ where: { id: asset.id }, data: { storage: 'DATABASE' } });
              const where = { id: record.id, iconKey: record.iconKey, [field]: null };
              const data = { [field]: asset.id };
              const updated =
                resource === 'skill'
                  ? await tx.skill.updateMany({ where, data })
                  : await tx.socialLink.updateMany({ where, data });
              changed += updated.count;
          });
        }
      }
    }
    console.log(
      `Updated ${changed} empty icon references; existing custom icons and business fields preserved.`,
    );
  } finally {
    await Promise.allSettled([lock.end(), prisma.$disconnect()]);
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Icon import failed');
  process.exitCode = 1;
});

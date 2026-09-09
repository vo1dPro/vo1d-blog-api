import 'reflect-metadata';
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../src/config/app-config.service.js';
import { validateEnvironment } from '../src/config/environment.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { MediaService } from '../src/media/media.service.js';
import { StorageService } from '../src/media/storage.service.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.length > 1 || args.some((arg) => arg !== '--check')) {
    throw new Error('Usage: pnpm migrate:icons [-- --check]');
  }
  const config = new AppConfigService(new ConfigService(validateEnvironment(process.env)));
  const prisma = new PrismaService(config);
  const storage = new StorageService(config);
  const media = new MediaService(prisma, storage, config);
  try {
    const [skills, socials] = await Promise.all([
      prisma.skill.findMany({ select: { iconMediaId: true, darkIconMediaId: true } }),
      prisma.socialLink.findMany({ select: { iconMediaId: true, darkIconMediaId: true } }),
    ]);
    const ids = [...skills, ...socials].flatMap((row) => [row.iconMediaId, row.darkIconMediaId]);
    const result = await media.ensureDatabaseImages(ids, args.includes('--check'));
    console.log(JSON.stringify({ checkOnly: args.includes('--check'), ...result }));
  } finally {
    await prisma.$disconnect();
    storage.onApplicationShutdown();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Database icon migration failed');
  process.exitCode = 1;
});

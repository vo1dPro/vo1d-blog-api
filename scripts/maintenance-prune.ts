import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  const now = new Date();
  const retentionMs = Math.max(
    86_400_000,
    Number(process.env.LOGIN_RATE_LIMIT_BLOCK_SECONDS ?? 300) * 1000,
    Number(process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS ?? 60) * 1000,
  );
  const [sessions, throttles] = await prisma.$transaction([
    prisma.adminSession.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.loginThrottle.deleteMany({
      where: {
        updatedAt: { lt: new Date(now.getTime() - retentionMs) },
        OR: [{ blockedUntil: null }, { blockedUntil: { lte: now } }],
      },
    }),
  ]);
  console.info(
    JSON.stringify({
      expiredSessionsRemoved: sessions.count,
      oldThrottleBucketsRemoved: throttles.count,
    }),
  );
} finally {
  await prisma.$disconnect();
}

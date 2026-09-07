import 'dotenv/config';
import { stdin, stdout } from 'node:process';
import { readConfirmedPassword } from './lib/admin-password.js';
import { createInterface } from 'node:readline/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/prisma/client.js';

async function main(): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY)
    throw new Error(
      'Run pnpm admin:create from an interactive terminal; passwords are never read from arguments',
    );
  const databaseUrl = z.string().min(1, 'DATABASE_URL is required').parse(process.env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const terminal = createInterface({ input: stdin, output: stdout });
    let email: string;
    try {
      email = z
        .email()
        .max(254)
        .parse((await terminal.question('Administrator email: ')).trim().toLowerCase());
      const existing = await prisma.adminUser.findUnique({ where: { email } });
      if (existing) {
        const answer = await terminal.question(
          'This administrator exists. Type RESET to replace the password, activate the account and revoke all sessions: ',
        );
        if (answer !== 'RESET')
          throw new Error('Cancelled; existing administrator was not changed');
      }
    } finally {
      terminal.close();
    }
    const password = await readConfirmedPassword();
    console.log('Password confirmed. Saving administrator...');
    const passwordHash = await hash(password, {
      type: argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    const result = await prisma.$transaction(async (tx) => {
      const admin = await tx.adminUser.upsert({
        where: { email },
        create: { email, passwordHash, isActive: true },
        update: { passwordHash, isActive: true },
      });
      await tx.adminSession.deleteMany({ where: { adminUserId: admin.id } });
      return { id: admin.id, email: admin.email };
    });
    console.log(
      `Administrator ${result.email} (ID ${result.id}) is ready. All previous sessions were revoked.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Administrator creation failed');
  process.exitCode = 1;
});

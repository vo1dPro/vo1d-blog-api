import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash, argon2id } from 'argon2';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/prisma/client.js';

const endpoint = (
  process.env.SMOKE_API_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`
).replace(/\/+$/, '');
const target = new URL(endpoint);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error(
    'Smoke creates a temporary administrator and only supports an explicitly local API',
  );
}
const databaseUrl = z.string().min(1).parse(process.env.DATABASE_URL);
const origin = z.string().min(1).parse(process.env.FRONTEND_ORIGINS?.split(',')[0]);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const nonce = randomBytes(16).toString('hex');
const email = `smoke-${nonce}@example.test`;
const password = randomBytes(32).toString('base64url');
let adminId: number | undefined;
const counts: Record<string, number> = {};
const steamVerification: Record<string, unknown> = {};
try {
  const health = await fetch(`${endpoint}/health`);
  assert.equal(health.status, 200);
  for (const resource of [
    'articles',
    'categories',
    'tags',
    'books',
    'games',
    'photos',
    'skills',
    'social-links',
  ]) {
    const response = await fetch(`${endpoint}/${resource}?pageSize=50`);
    assert.equal(response.status, 200);
    const page = z
      .object({ items: z.array(z.unknown()), total: z.number() })
      .parse(await response.json());
    counts[resource] = page.total;
  }
  const article = await fetch(`${endpoint}/articles/1`);
  assert.equal(article.status, 200);
  const detail = z
    .object({ contentHtml: z.string(), cover: z.object({ url: z.string() }) })
    .parse(await article.json());
  assert.ok(detail.contentHtml.includes('<p>'));
  assert.equal((await fetch(detail.cover.url)).status, 200);
  assert.equal((await fetch(`${endpoint}/site-profile`)).status, 200);
  assert.equal((await fetch(`${endpoint}/admin/articles`)).status, 401);
  adminId = (
    await prisma.adminUser.create({
      data: { email, passwordHash: await hash(password, { type: argon2id }) },
    })
  ).id;
  const login = await fetch(`${endpoint}/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie);
  const me = await fetch(`${endpoint}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  assert.equal(
    (await fetch(`${endpoint}/admin/articles`, { headers: { Cookie: cookie } })).status,
    200,
  );
  if (process.env.VERIFY_STEAM === 'true') {
    const statusResponse = await fetch(`${endpoint}/admin/steam/status`, {
      headers: { Cookie: cookie },
    });
    assert.equal(statusResponse.status, 200);
    const status = z
      .object({
        enabled: z.boolean(),
        gameCount: z.number(),
        lastSuccessAt: z.string().nullable(),
        lastErrorCode: z.string().nullable(),
      })
      .parse(await statusResponse.json());
    assert.equal(status.enabled, true);
    assert.ok(status.lastSuccessAt);
    assert.equal(status.lastErrorCode, null);
    const library = await fetch(`${endpoint}/admin/steam/library?pageSize=50`, {
      headers: { Cookie: cookie },
    });
    assert.equal(library.status, 200);
    const page = z.object({ total: z.number() }).parse(await library.json());
    assert.equal(page.total, status.gameCount);
    Object.assign(steamVerification, {
      status: 200,
      library: 200,
      gameCount: page.total,
      lastSuccessAt: status.lastSuccessAt,
    });
    if (process.env.VERIFY_STEAM_LINK_MATCHES === 'true') {
      const linked = await fetch(`${endpoint}/admin/steam/link-matches`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: origin },
      });
      assert.equal(linked.status, 200);
      steamVerification.linkedGameIds = z
        .object({ linkedGameIds: z.array(z.number()) })
        .parse(await linked.json()).linkedGameIds;
      const again = await fetch(`${endpoint}/admin/steam/link-matches`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: origin },
      });
      assert.equal(again.status, 200);
      assert.deepEqual(await again.json(), { linkedGameIds: [] });
    }
    const gamesResponse = await fetch(`${endpoint}/games?pageSize=50`);
    assert.equal(gamesResponse.status, 200);
    const gamePage = z
      .object({
        items: z.array(z.object({ steam: z.object({ playtimeMinutes: z.number() }).nullable() })),
      })
      .parse(await gamesResponse.json());
    steamVerification.publicLinkedGames = gamePage.items.filter(
      (game) => game.steam !== null,
    ).length;
  }
  const logout = await fetch(`${endpoint}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin },
  });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(`${endpoint}/auth/me`, { headers: { Cookie: cookie } })).status, 401);
  const docs = await fetch(new URL('/docs', target));
  assert.equal(docs.status, 200);
  const schema = await fetch(new URL('/docs-json', target));
  assert.equal(schema.status, 200);
  const openapi = z
    .object({
      paths: z.record(z.string(), z.unknown()),
      components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
    })
    .parse(await schema.json());
  console.info(
    JSON.stringify(
      {
        endpoint,
        health: 200,
        counts,
        media: 200,
        login: 200,
        protected: 200,
        unauthenticated: 401,
        logout: 204,
        revokedSession: 401,
        swagger: 200,
        documentedPaths: Object.keys(openapi.paths).length,
        documentedSchemas: Object.keys(openapi.components.schemas).length,
        ...(process.env.VERIFY_STEAM === 'true' ? { steam: steamVerification } : {}),
      },
      null,
      2,
    ),
  );
} finally {
  if (adminId !== undefined) await prisma.adminUser.delete({ where: { id: adminId } });
  await prisma.$disconnect();
}

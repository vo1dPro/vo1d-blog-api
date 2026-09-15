import 'reflect-metadata';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { Pool } from 'pg';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConfigService } from '../src/config/app-config.service.js';
import { SteamClient, SteamUpstreamError } from '../src/steam/steam.client.js';
import { SteamService } from '../src/steam/steam.service.js';
import { z } from 'zod';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { StorageService } from '../src/media/storage.service.js';
import { MediaService } from '../src/media/media.service.js';
import { configureTestEnvironment, deployTestMigrations } from './support/test-environment.js';

const origin = 'http://localhost:5173';
const entitySchema = z.object({ id: z.number().int() }).passthrough();
const pageSchema = z.object({
  items: z.array(entitySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
const mediaSchema = z.object({
  id: z.number().int(),
  url: z.string().url(),
  mimeType: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  altText: z.string().nullable(),
  kind: z.string(),
});

describe('REST API with real PostgreSQL and S3-compatible storage', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let sql: Pool;
  let s3: S3Client;
  let server: Server;
  let bucket: string;
  let adminId: number;
  let categoryId: number;
  let otherCategoryId: number;
  let hiddenCategoryId: number;
  let tagId: number;
  let coverId: number;
  let articleId: number;
  let bookId: number;
  let gameId: number;
  let cookie: string;
  let passwordHash: string;
  const email = 'admin-e2e@example.test';
  const password = `${randomBytes(24).toString('base64url')}aB1!`;

  beforeAll(async () => {
    sql = new Pool({ connectionString: configureTestEnvironment() });
    await deployTestMigrations();
    const [{ createApp }, { PrismaService: PrismaToken }, { StorageService: StorageToken }] =
      await Promise.all([
        import('../src/bootstrap.js'),
        import('../src/database/prisma.service.js'),
        import('../src/media/storage.service.js'),
      ]);
    app = await createApp();
    prisma = app.get(PrismaToken);
    storage = app.get(StorageToken);
    server = app.getHttpServer();
    bucket = z.string().min(1).parse(process.env.S3_BUCKET);
    s3 = new S3Client({
      endpoint: z.string().url().parse(process.env.S3_ENDPOINT),
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: z.string().min(1).parse(process.env.S3_ACCESS_KEY_ID),
        secretAccessKey: z.string().min(1).parse(process.env.S3_SECRET_ACCESS_KEY),
      },
    });
    passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  });

  async function cleanup(): Promise<void> {
    const media = await prisma.mediaAsset.findMany({ select: { objectKey: true } });
    for (const asset of media) {
      await storage.deleteObject(asset.objectKey);
    }
    await sql.query(
      'TRUNCATE TABLE steam_games, steam_sync_states, article_tags, articles, books, games, photos, site_profiles, categories, tags, skills, social_links, media_assets, admin_sessions, admin_users, login_throttles RESTART IDENTITY CASCADE',
    );
  }

  beforeEach(async () => {
    await cleanup();
    const admin = await prisma.adminUser.create({ data: { email, passwordHash } });
    adminId = admin.id;
    const token = randomBytes(32).toString('base64url');
    await prisma.adminSession.create({
      data: {
        adminUserId: admin.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 3_600_000),
        lastUsedAt: new Date(),
      },
    });
    cookie = `${process.env.SESSION_COOKIE_NAME ?? 'vo1d_admin_session'}=${token}`;
    const cover = await prisma.mediaAsset.create({
      data: {
        objectKey: `media/test/${randomUUID()}.webp`,
        mimeType: 'image/webp',
        sizeBytes: 100,
        width: 32,
        height: 32,
        kind: 'IMAGE',
      },
    });
    coverId = cover.id;
    const categories = await Promise.all([
      prisma.category.create({ data: { key: 'technology', label: 'Technology', sortOrder: 0 } }),
      prisma.category.create({ data: { key: 'life', label: 'Life', sortOrder: 1 } }),
      prisma.category.create({ data: { key: 'secret', label: 'Secret', isVisible: false } }),
    ]);
    categoryId = z.number().parse(categories[0]?.id);
    otherCategoryId = z.number().parse(categories[1]?.id);
    hiddenCategoryId = z.number().parse(categories[2]?.id);
    const tag = await prisma.tag.create({ data: { slug: 'typescript', name: 'TypeScript' } });
    tagId = tag.id;
    const primary = await prisma.article.create({
      data: {
        slug: 'typescript-guide',
        title: 'TypeScript Guide',
        summary: 'Strict types and validation',
        bodyMarkdown: '# Introduction\n\nThis is `safe()` Markdown.',
        categoryId,
        coverMediaId: coverId,
        status: 'PUBLISHED',
        publishedAt: new Date('2024-01-01T00:00:00.000Z'),
        readingTimeMinutes: 4,
        tags: { create: [{ tagId }] },
      },
    });
    articleId = primary.id;
    await prisma.article.create({
      data: {
        slug: 'related-guide',
        title: 'Related Guide',
        summary: 'Shared tags and category',
        bodyMarkdown: 'Related.',
        categoryId,
        coverMediaId: coverId,
        status: 'PUBLISHED',
        publishedAt: new Date('2024-02-01T00:00:00.000Z'),
        readingTimeMinutes: 2,
        tags: { create: [{ tagId }] },
      },
    });
    await prisma.article.create({
      data: {
        slug: 'travel-notes',
        title: 'Travel Notes',
        summary: 'A quiet journey',
        bodyMarkdown: 'Travel.',
        categoryId: otherCategoryId,
        coverMediaId: coverId,
        status: 'PUBLISHED',
        publishedAt: new Date('2024-03-01T00:00:00.000Z'),
        readingTimeMinutes: 3,
      },
    });
    for (const [slug, status, date, articleCategoryId] of [
      ['draft-article', 'DRAFT', null, categoryId],
      ['archived-article', 'ARCHIVED', new Date('2023-01-01Z'), categoryId],
      ['future-article', 'PUBLISHED', new Date('2099-01-01Z'), categoryId],
      ['hidden-category-article', 'PUBLISHED', new Date('2024-01-01Z'), hiddenCategoryId],
    ] as const) {
      await prisma.article.create({
        data: {
          slug,
          title: slug,
          summary: 'Should not leak',
          bodyMarkdown: 'Private source',
          categoryId: articleCategoryId,
          coverMediaId: coverId,
          status,
          publishedAt: date,
          readingTimeMinutes: 1,
        },
      });
    }
    const book = await prisma.book.create({
      data: {
        title: 'Visible Book',
        author: 'Author',
        coverMediaId: coverId,
        accent: '#aabbcc',
        readingOrder: 1,
      },
    });
    bookId = book.id;
    const game = await prisma.game.create({
      data: {
        title: 'Visible Game',
        coverMediaId: coverId,
        rating: 8.5,
        playtimeHours: 0,
        likeLevel: 0,
      },
    });
    gameId = game.id;
    await prisma.siteProfile.create({
      data: {
        displayName: 'Test Author',
        role: 'Developer',
        heroTitlePrefix: 'Hello',
        heroDescription: 'Description',
        learningNote: 'Learning',
        footerMessage: 'Footer',
      },
    });
    await prisma.skill.createMany({
      data: [
        { name: 'React', iconKey: 'react', sortOrder: 1 },
        { name: 'PostgreSQL', iconKey: 'postgresql', sortOrder: 0 },
        { name: 'Private Skill', iconKey: 'private', isVisible: false },
      ],
    });
    await prisma.socialLink.createMany({
      data: [
        {
          name: 'GitHub',
          platform: 'github',
          url: 'https://github.com/example',
          iconKey: 'github',
        },
        {
          name: 'Private',
          platform: 'private',
          url: 'https://example.com',
          iconKey: 'private',
          isVisible: false,
        },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function enableMockSteam() {
    vi.spyOn(app.get(AppConfigService), 'steam', 'get').mockReturnValue({
      enabled: true,
      accounts: [
        { name: 'test', steamId: '76561198000000000', apiKey: randomBytes(16).toString('hex') },
      ],
      steamId: '76561198000000000',
      apiKey: randomBytes(16).toString('hex'),
      intervalMs: 60000,
      timeoutMs: 1000,
    });
    return vi.spyOn(app.get(SteamClient), 'getLibrary').mockResolvedValue([
      {
        appId: 730,
        name: 'Visible Game',
        playtimeMinutes: 125,
        playtimeTwoWeeksMinutes: 20,
        lastPlayedAt: new Date('2025-01-01Z'),
      },
    ]);
  }

  it('aggregates multiple accounts, isolates failures and matches duplicate app IDs once', async () => {
    const accounts = ['76561198000000001', '76561198000000002', '76561198000000003'].map(
      (steamId, index) => ({
        name: 'account-' + index,
        steamId,
        apiKey: randomBytes(16).toString('hex'),
      }),
    );
    vi.spyOn(app.get(AppConfigService), 'steam', 'get').mockReturnValue({
      enabled: true,
      steamId: '',
      apiKey: '',
      accounts,
      intervalMs: 60000,
      timeoutMs: 1000,
    });
    const fetcher = vi.spyOn(app.get(SteamClient), 'getLibrary').mockImplementation((account) => {
      if (account?.steamId === accounts[2]?.steamId)
        return Promise.reject(new SteamUpstreamError('NETWORK'));
      return Promise.resolve([
        {
          appId: 730,
          name: 'Visible Game',
          playtimeMinutes: account?.steamId === accounts[0]?.steamId ? 72000 : 12000,
          playtimeTwoWeeksMinutes: 0,
          lastPlayedAt: null,
        },
      ]);
    });
    const initial = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    await prisma.game.update({ where: { id: gameId }, data: { title: 'Visible Game' } });
    const sync = await post('admin/steam/sync', {}).set('Cookie', cookie).expect(200);
    expect(sync.body).toMatchObject({ gameCount: 1, lastErrorCode: 'NETWORK' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await post('admin/steam/link-matches', {}).set('Cookie', cookie).expect(200);
    const game = await get('admin/games/' + gameId)
      .set('Cookie', cookie)
      .expect(200);
    expect(game.body).toMatchObject({
      playtimeHours: 1400,
      manualPlaytimeHours: initial.playtimeHours,
      steam: { playtimeMinutes: 84000, incomplete: true },
    });
    const library = await get('admin/steam/library?pageSize=1').set('Cookie', cookie).expect(200);
    expect(library.body).toMatchObject({ total: 1, items: [{ playtimeMinutes: 84000 }] });
    await post('admin/steam/sync', {}).set('Cookie', cookie).expect(429);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(sync.body)).not.toContain(accounts[0]?.apiKey);
  });

  it('stores icon references, returns media URLs and protects both theme variants from deletion', async () => {
    const image = await sharp({
      create: { width: 32, height: 32, channels: 4, background: '#3366ff' },
    })
      .png()
      .toBuffer();
    const upload = await request(server)
      .post('/admin/media/images')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .field('purpose', 'ICON')
      .attach('file', image, { filename: 'icon.png', contentType: 'image/png' })
      .expect(201);
    const id = z.object({ asset: z.object({ id: z.number() }) }).parse(upload.body).asset.id;
    const stored = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id },
      include: { content: true },
    });
    expect(stored.storage).toBe('DATABASE');
    expect(stored.content?.bytes.byteLength).toBe(stored.sizeBytes);
    const content = await request(server)
      .get(`/media/${id}/content`)
      .set('Origin', origin)
      .expect(200);
    expect(content.headers['content-type']).toContain('image/webp');
    expect(content.headers['access-control-allow-origin']).toBe(origin);
    expect(content.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(content.headers['cache-control']).toBe('public, max-age=86400');
    expect(
      createHash('sha256')
        .update(content.body as Buffer)
        .digest('hex'),
    ).toBe(stored.content?.sha256);
    await request(server)
      .get(`/media/${id}/content`)
      .set('If-None-Match', String(content.headers.etag))
      .expect(304);
    await request(server).get(`/media/${coverId}/content`).expect(404);
    const created = await post('admin/skills', {
      name: 'Icon test',
      iconKey: 'custom',
      iconMediaId: id,
      darkIconMediaId: id,
    })
      .set('Cookie', cookie)
      .expect(201);
    const skill = z
      .object({
        id: z.number(),
        icon: z.object({ url: z.string() }),
        darkIcon: z.object({ id: z.number() }),
      })
      .parse(created.body);
    expect(skill.darkIcon.id).toBe(id);
    await remove('admin/media/' + id)
      .set('Cookie', cookie)
      .expect(409);
    await patch('admin/skills/' + skill.id, { iconMediaId: null })
      .set('Cookie', cookie)
      .expect(200);
    await remove('admin/media/' + id)
      .set('Cookie', cookie)
      .expect(409);
    await patch('admin/skills/' + skill.id, { darkIconMediaId: null })
      .set('Cookie', cookie)
      .expect(200);
    const social = await post('admin/social-links', {
      name: 'Icon social',
      platform: 'custom',
      iconKey: 'custom',
      url: 'https://example.com',
      iconMediaId: id,
    })
      .set('Cookie', cookie)
      .expect(201);
    const socialId = z.object({ id: z.number() }).parse(social.body).id;
    await remove('admin/media/' + id)
      .set('Cookie', cookie)
      .expect(409);
    await patch('admin/social-links/' + socialId, { iconMediaId: 9999999 })
      .set('Cookie', cookie)
      .expect(400);
    await patch('admin/social-links/' + socialId, { iconMediaId: null })
      .set('Cookie', cookie)
      .expect(200);
    await remove('admin/media/' + id)
      .set('Cookie', cookie)
      .expect(204);
    expect(await prisma.mediaContent.findUnique({ where: { mediaId: id } })).toBeNull();
    await request(server).get(`/media/${id}/content`).expect(404);
  });

  it('checks and migrates existing images without changing IDs, bytes or deleting storage objects', async () => {
    const image = await sharp({
      create: { width: 24, height: 24, channels: 4, background: '#225588' },
    })
      .png()
      .toBuffer();
    const upload = await request(server)
      .post('/admin/media/images')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .field('purpose', 'IMAGE')
      .attach('file', image, { filename: 'existing.png', contentType: 'image/png' })
      .expect(201);
    const id = z.object({ asset: z.object({ id: z.number() }) }).parse(upload.body).asset.id;
    const before = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    const original = await storage.getObject(before.objectKey, 10 * 1024 * 1024);
    const media = app.get(MediaService);
    expect(await media.ensureDatabaseImages([id, id, null], true)).toEqual({
      existing: 0,
      migrated: 0,
      pending: 1,
    });
    expect(await prisma.mediaContent.findUnique({ where: { mediaId: id } })).toBeNull();
    expect(await media.ensureDatabaseImages([id])).toEqual({
      existing: 0,
      migrated: 1,
      pending: 0,
    });
    expect(await media.ensureDatabaseImages([id])).toEqual({
      existing: 1,
      migrated: 0,
      pending: 0,
    });
    const after = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id },
      include: { content: true },
    });
    expect(after.objectKey).toBe(before.objectKey);
    expect(Buffer.from(after.content!.bytes)).toEqual(original);
    expect(await storage.getObject(before.objectKey, 10 * 1024 * 1024)).toEqual(original);
    await prisma.mediaContent.update({ where: { mediaId: id }, data: { sha256: '0'.repeat(64) } });
    await expect(media.ensureDatabaseImages([id])).rejects.toThrow('integrity check failed');
  });

  it('serves root routes only and issues root-scoped cookies', async () => {
    await request(server).get('/games').expect(200);
    await request(server).get('/api/v1/games').expect(404);
    await request(server).get('/v1/games').expect(404);
    const login = await post('auth/login', { email, password }).expect(200);
    const cookies = z.array(z.string()).parse(login.headers['set-cookie']);
    expect(cookies.some((value) => value.includes('Path=/;'))).toBe(true);
    const doc = await get('docs-json').expect(200);
    const paths = z.object({ paths: z.record(z.string(), z.unknown()) }).parse(doc.body).paths;
    expect(
      Object.keys(paths).every((path) => !path.startsWith('/api/') && !path.startsWith('/v1/')),
    ).toBe(true);
  });

  it('protects Steam controls, rejects untrusted writes, and reports disabled status', async () => {
    for (const path of ['status', 'library']) await get(`admin/steam/${path}`).expect(401);
    for (const path of ['sync', 'link-matches'])
      await request(server).post(`/admin/steam/${path}`).set('Origin', origin).send({}).expect(401);
    await request(server).post('/admin/steam/sync').set('Cookie', cookie).expect(403);
    await post('admin/steam/sync', {}).set('Cookie', cookie).expect(503);
    const status = await get('admin/steam/status').set('Cookie', cookie).expect(200);
    expect(status.body).toMatchObject({ enabled: false });
    expect(status.headers['cache-control']).toBe('no-store');
  });

  it('syncs idempotently without publishing games or overwriting editorial data', async () => {
    const fetcher = enableMockSteam();
    const initial = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
    await post('admin/steam/sync', {}).set('Cookie', cookie).expect(200);
    const library = await get('admin/steam/library?pageSize=1').set('Cookie', cookie).expect(200);
    expect(library.body).toMatchObject({ total: 1, pageSize: 1 });
    await patch(`admin/games/${gameId}`, { steamAppId: 730 }).set('Cookie', cookie).expect(200);
    const publicGames = await get('games').expect(200);
    const games = z
      .object({
        items: z.array(z.object({ id: z.number(), playtimeHours: z.number(), steam: z.unknown() })),
      })
      .parse(publicGames.body);
    expect(games.items.find((g) => g.id === gameId)).toMatchObject({
      playtimeHours: 2,
      steam: { playtimeMinutes: 125 },
    });
    expect(await prisma.game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({
      rating: initial.rating,
      likeLevel: initial.likeLevel,
      comment: initial.comment,
      playtimeHours: initial.playtimeHours,
      coverMediaId: initial.coverMediaId,
    });
    await post('admin/steam/sync', {}).set('Cookie', cookie).expect(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await prisma.steamSyncState.updateMany({ data: { nextSyncAt: new Date(0) } });
    await post('admin/steam/sync', {}).set('Cookie', cookie).expect(200);
    expect(await prisma.steamGame.count()).toBe(1);
    await patch(`admin/games/${gameId}`, { steamAppId: null }).set('Cookie', cookie).expect(200);
    const result = await get(`admin/games/${gameId}`).set('Cookie', cookie).expect(200);
    expect(result.body).toMatchObject({ steam: null, playtimeHours: initial.playtimeHours });
  });

  it.each([1, 8])(
    'uses custom %i hours instead of Steam and restores Steam when reset to zero',
    async (customHours) => {
      const fetcher = enableMockSteam();
      const steam = app.get(SteamService);
      await steam.sync();
      await patch(`admin/games/${gameId}`, { steamAppId: 730, playtimeHours: customHours })
        .set('Cookie', cookie)
        .expect(200);
      const edited = await get(`admin/games/${gameId}`).set('Cookie', cookie).expect(200);
      expect(edited.body).toMatchObject({
        playtimeHours: customHours,
        manualPlaytimeHours: customHours,
        steam: { playtimeMinutes: 125 },
      });
      const publicPage = pageSchema.parse((await get('games').expect(200)).body);
      expect(publicPage.items.find((game) => game.id === gameId)).toMatchObject({
        playtimeHours: customHours,
      });
      // A fresh sync must update only the Steam snapshot, not replace or add to the override.
      fetcher.mockResolvedValue([
        {
          appId: 730,
          name: 'Visible Game',
          playtimeMinutes: 305,
          playtimeTwoWeeksMinutes: 0,
          lastPlayedAt: null,
        },
      ]);
      await prisma.steamSyncState.updateMany({ data: { nextSyncAt: new Date(0) } });
      await steam.sync();
      expect(
        (await get(`admin/games/${gameId}`).set('Cookie', cookie).expect(200)).body,
      ).toMatchObject({
        playtimeHours: customHours,
        manualPlaytimeHours: customHours,
        steam: { playtimeMinutes: 305 },
      });
      expect(
        (
          await patch(`admin/games/${gameId}`, { playtimeHours: 0 })
            .set('Cookie', cookie)
            .expect(200)
        ).body,
      ).toMatchObject({ playtimeHours: 5, manualPlaytimeHours: 0 });
      expect(
        (
          await patch(`admin/games/${gameId}`, { steamAppId: null, playtimeHours: customHours })
            .set('Cookie', cookie)
            .expect(200)
        ).body,
      ).toMatchObject({ playtimeHours: customHours, steam: null });
      expect(
        (
          await patch(`admin/games/${gameId}`, { playtimeHours: 0 })
            .set('Cookie', cookie)
            .expect(200)
        ).body,
      ).toMatchObject({ playtimeHours: 0, steam: null });
    },
  );

  it('shares the sync lease across concurrent triggers and retains cached data on failure', async () => {
    const fetcher = enableMockSteam();
    const service = app.get(SteamService);
    const results = await Promise.allSettled([service.sync(), service.sync(), service.sync()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await prisma.steamSyncState.updateMany({ data: { nextSyncAt: new Date(0) } });
    fetcher.mockRejectedValue(new SteamUpstreamError('RATE_LIMITED'));
    await post('admin/steam/sync', {}).set('Cookie', cookie).expect(503);
    expect(await prisma.steamGame.count()).toBe(1);
    const library = await get('admin/steam/library').set('Cookie', cookie).expect(200);
    expect(library.body).toMatchObject({ items: [{ stale: true, playtimeMinutes: 125 }] });
    const status = await service.status();
    expect(status.lastErrorCode).toBe('RATE_LIMITED');
    expect(new Date(status.nextSyncAt ?? '').getTime()).toBeGreaterThan(Date.now());
  });

  it.each(['PRIVATE_LIBRARY', 'UNAUTHORIZED'] as const)(
    'retains linked game hours after %s while keeping new links restricted',
    async (code) => {
      const fetcher = enableMockSteam();
      await app.get(SteamService).sync();
      await prisma.game.update({ where: { id: gameId }, data: { steamAppId: 730 } });
      await prisma.steamSyncState.updateMany({ data: { nextSyncAt: new Date(0) } });
      fetcher.mockRejectedValue(new SteamUpstreamError(code));
      await expect(app.get(SteamService).sync()).rejects.toThrow(code);
      expect(await prisma.steamGame.count()).toBe(1);
      const result = await get(`admin/games/${gameId}`).set('Cookie', cookie).expect(200);
      expect(result.body).toMatchObject({
        playtimeHours: 2,
        steam: { playtimeMinutes: 125, stale: true, incomplete: true },
      });
      const published = await get('games?pageSize=50').expect(200);
      const publicGames = z
        .object({
          items: z.array(
            z.object({ id: z.number(), playtimeHours: z.number(), steam: z.unknown() }),
          ),
        })
        .parse(published.body);
      expect(publicGames.items.find((game) => game.id === gameId)).toMatchObject({
        playtimeHours: 2,
        steam: { playtimeMinutes: 125, stale: true, incomplete: true },
      });
      await expect(app.get(SteamService).assertApp(730)).rejects.toThrow(
        'current visible synced library',
      );
      const library = await get('admin/steam/library').set('Cookie', cookie).expect(200);
      expect(library.body).toMatchObject({ items: [], total: 0 });
    },
  );

  it('links unique exact names, retains links on repeated calls, and never guesses translations', async () => {
    enableMockSteam();
    await prisma.game.update({ where: { id: gameId }, data: { title: 'Visible Game' } });
    await app.get(SteamService).sync();
    const first = await post('admin/steam/link-matches', {}).set('Cookie', cookie).expect(200);
    expect(first.body).toEqual({ linkedGameIds: [gameId] });
    const second = await post('admin/steam/link-matches', {}).set('Cookie', cookie).expect(200);
    expect(second.body).toEqual({ linkedGameIds: [] });
    await patch(`admin/games/${gameId}`, { steamAppId: 999999 }).set('Cookie', cookie).expect(503);
  });

  afterAll(async () => {
    if (prisma && storage && sql) await cleanup();
    if (app) await app.close();
    if (sql) await sql.end();
    if (s3) s3.destroy();
  });

  function get(path: string): request.Test {
    return request(server).get(`/${path}`);
  }
  function post(path: string, payload: object): request.Test {
    return request(server)
      .post(`/${path}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(payload);
  }
  function patch(path: string, payload: object): request.Test {
    return request(server)
      .patch(`/${path}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(payload);
  }
  function remove(path: string): request.Test {
    return request(server).delete(`/${path}`).set('Origin', origin).set('Cookie', cookie);
  }
  function articlePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      slug: 'new-article',
      title: 'New Article',
      summary: 'Summary',
      bodyMarkdown: 'Markdown',
      categoryId,
      coverMediaId: coverId,
      readingTimeMinutes: 1,
      status: 'DRAFT',
      tagIds: [],
      ...overrides,
    };
  }

  it('reports application and database health without caching', async () => {
    const response = await get('health').expect(200);
    const health = z
      .object({ status: z.literal('ok'), database: z.literal('up'), timestamp: z.iso.datetime() })
      .parse(response.body);
    expect(health.database).toBe('up');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('reports 503 when the database health query fails', async () => {
    const failure = vi
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValueOnce(new Error('Simulated disconnected database'));
    try {
      await get('health').expect(503);
    } finally {
      failure.mockRestore();
    }
  });

  it('does not reset published status during a title-only edit and rejects null required fields', async () => {
    await patch(`admin/articles/${articleId}`, { title: 'Title-only edit' }).expect(200);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).status).toBe(
      'PUBLISHED',
    );
    await get(`articles/${articleId}`).expect(200);
    await patch(`admin/articles/${articleId}`, { title: null }).expect(400);
    await patch('admin/site-profile', { displayName: null }).expect(400);
  });

  it('serializes concurrent login attempts and cannot evade IP throttles by changing email', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        post('auth/login', {
          email: `concurrent-${index}@example.test`,
          password: 'not-a-password',
        }),
      ),
    );
    expect(responses.filter((response) => response.status === 401)).toHaveLength(6);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(4);
  });

  it('compensates object uploads when the database write fails', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#112233' } })
      .png()
      .toBuffer();
    const put = vi.spyOn(storage, 'putObject');
    const deletion = vi.spyOn(storage, 'deleteObject');
    const failure = vi
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('Simulated DB failure'));
    try {
      await request(server)
        .post('/admin/media/images')
        .set('Cookie', cookie)
        .set('Origin', origin)
        .attach('file', png, { filename: 'image.png', contentType: 'image/png' })
        .expect(500);
      const key = z.string().parse(put.mock.calls[0]?.[0]);
      expect(deletion).toHaveBeenCalledWith(key);
      await expect(
        s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
      ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
      expect(await prisma.mediaAsset.count()).toBe(1);
    } finally {
      failure.mockRestore();
      put.mockRestore();
      deletion.mockRestore();
    }
  });

  it('serves Swagger UI and explicit cookie auth / models / multipart upload contracts', async () => {
    const html = await request(server).get('/docs').expect(200);
    expect(html.text).toContain('swagger-ui');
    const document = await request(server).get('/docs-json').expect(200);
    const openapi = z
      .object({
        paths: z.record(z.string(), z.unknown()),
        components: z.object({
          schemas: z.record(z.string(), z.unknown()),
          securitySchemes: z.record(z.string(), z.unknown()),
        }),
      })
      .parse(document.body);
    expect(openapi.paths).toHaveProperty('/admin/media/images');
    expect(Object.keys(openapi.components.schemas).length).toBeGreaterThan(15);
    expect(Object.values(openapi.components.securitySchemes)).toContainEqual(
      expect.objectContaining({ type: 'apiKey', in: 'cookie' }),
    );
  });

  it('creates a random HttpOnly Lax session and stores only its SHA-256 hash', async () => {
    const response = await post('auth/login', { email: 'ADMIN-E2E@EXAMPLE.TEST', password }).expect(
      200,
    );
    expect(response.headers['cache-control']).toContain('no-store');
    const cookies = z.array(z.string()).parse(response.headers['set-cookie']);
    const setCookie = z.string().parse(cookies[0]);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const sessionCookie = setCookie.split(';')[0];
    const token = sessionCookie?.split('=')[1];
    expect(Buffer.from(z.string().parse(token), 'base64url').length).toBeGreaterThanOrEqual(32);
    const hash = createHash('sha256').update(z.string().parse(token)).digest('hex');
    const session = await prisma.adminSession.findUniqueOrThrow({ where: { tokenHash: hash } });
    expect(session.adminUserId).toBe(adminId);
    expect(JSON.stringify(session)).not.toContain(token);
    const me = await get('auth/me').set('Cookie', z.string().parse(sessionCookie)).expect(200);
    expect(me.body).toEqual({ id: adminId, email });
    expect(me.headers['cache-control']).toContain('no-store');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('rejects wrong credentials and inactive administrators with the same 401 shape', async () => {
    const wrong = await post('auth/login', { email, password: 'incorrect-password' }).expect(401);
    const missing = await post('auth/login', { email: 'missing@example.test', password }).expect(
      401,
    );
    expect(wrong.body).toEqual(missing.body);
    await prisma.adminUser.update({ where: { id: adminId }, data: { isActive: false } });
    await post('auth/login', { email, password }).expect(401);
    await get('auth/me').set('Cookie', cookie).expect(401);
  });

  it('limits login attempts and enforces the limit after the maximum', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await post('auth/login', { email, password: 'incorrect-password' }).expect(401);
    }
    await post('auth/login', { email, password }).expect(429);
    expect(await prisma.loginThrottle.count()).toBeGreaterThan(0);
  });

  it('removes the session and clears the cookie on logout', async () => {
    const response = await post('auth/logout', {}).expect(204);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('Expires=Thu, 01 Jan 1970')]),
    );
    await get('auth/me').set('Cookie', cookie).expect(401);
    expect(await prisma.adminSession.count()).toBe(0);
  });

  it('rejects and deletes expired sessions', async () => {
    await prisma.adminSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await get('auth/me').set('Cookie', cookie).expect(401);
    expect(await prisma.adminSession.count()).toBe(0);
  });

  it('returns 401 for malformed, forged and absent session cookies', async () => {
    await get('auth/me').expect(401);
    await get('auth/me').set('Cookie', 'vo1d_admin_session=%E0%A4%A').expect(401);
    await get('auth/me').set('Cookie', 'vo1d_admin_session=forged-token').expect(401);
  });

  it('protects every admin resource, including write and reorder routes', async () => {
    for (const resource of [
      'articles',
      'categories',
      'tags',
      'books',
      'games',
      'photos',
      'skills',
      'social-links',
      'media',
      'site-profile',
    ]) {
      await get(`admin/${resource}`).expect(401);
    }
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
      await get(`admin/${resource}/1`).expect(401);
      await request(server).post(`/admin/${resource}`).set('Origin', origin).send({}).expect(401);
      await request(server)
        .patch(`/admin/${resource}/1`)
        .set('Origin', origin)
        .send({})
        .expect(401);
      await request(server).delete(`/admin/${resource}/1`).set('Origin', origin).expect(401);
    }
    await request(server).post('/admin/media/images').set('Origin', origin).expect(401);
    await request(server)
      .patch('/admin/skills/reorder')
      .set('Origin', origin)
      .send({ items: [] })
      .expect(401);
  });

  it('enforces exact-origin CORS and rejects missing or untrusted write origins', async () => {
    const allowed = await get('skills').set('Origin', origin).expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await get('skills').set('Origin', `${origin}.attacker.example`);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    await request(server).post('/auth/login').send({ email, password }).expect(403);
    await request(server)
      .patch('/admin/site-profile')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({ displayName: 'Changed' })
      .expect(403);
    await request(server)
      .post('/auth/login')
      .set('Origin', 'null')
      .send({ email, password })
      .expect(403);
    const preflight = await request(server)
      .options('/admin/articles')
      .set('Origin', 'https://admin.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sets security headers and rejects unknown fields and oversized JSON bodies', async () => {
    const response = await get('health').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    await post('admin/skills', { name: 'New', iconKey: 'new', unexpected: 'value' }).expect(400);
    await post(
      'admin/articles',
      articlePayload({ bodyMarkdown: 'x'.repeat(1024 * 1024 + 1) }),
    ).expect(413);
  });

  it('publishes cacheable lists with ETags and supports conditional GET', async () => {
    const response = await get('articles').expect(200);
    expect(response.headers['cache-control']).toContain('public');
    const etag = z.string().parse(response.headers.etag);
    await get('articles').set('If-None-Match', etag).expect(304);
    const admin = await get('admin/articles').set('Cookie', cookie).expect(200);
    expect(admin.headers['cache-control']).toContain('no-store');
  });

  it('never exposes drafts, archived, future or hidden-category articles through any public route', async () => {
    const list = pageSchema.parse((await get('articles').expect(200)).body);
    expect(list.total).toBe(3);
    expect(list.items.map((item) => item.slug)).toEqual([
      'travel-notes',
      'related-guide',
      'typescript-guide',
    ]);
    for (const slug of [
      'draft-article',
      'archived-article',
      'future-article',
      'hidden-category-article',
    ]) {
      const item = await prisma.article.findUniqueOrThrow({ where: { slug } });
      await get(`articles/${slug}`).expect(404);
      await get(`articles/${item.id}`).expect(404);
      await get(`articles/${slug}/related`).expect(404);
    }
    expect(JSON.stringify(list)).not.toContain('bodyMarkdown');
    expect(JSON.stringify(list)).not.toContain('contentHtml');
  });

  it('supports article pagination, category, tag and case-insensitive text filters', async () => {
    const page = pageSchema.parse((await get('articles?page=2&pageSize=1').expect(200)).body);
    expect(page).toMatchObject({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
    expect(page.items[0]?.slug).toBe('related-guide');
    const category = pageSchema.parse((await get('articles?category=technology').expect(200)).body);
    expect(category.total).toBe(2);
    const tag = pageSchema.parse((await get('articles?tag=typescript').expect(200)).body);
    expect(tag.total).toBe(2);
    const search = pageSchema.parse((await get('articles?q=STRICT').expect(200)).body);
    expect(search.items.map((item) => item.id)).toEqual([articleId]);
    const empty = pageSchema.parse((await get('articles?category=missing').expect(200)).body);
    expect(empty).toMatchObject({ items: [], total: 0, totalPages: 0 });
    await get('articles?pageSize=51').expect(400);
    await get('articles?page=0').expect(400);
    await get('articles?pageSize=1.5').expect(400);
    await get('articles?unknown=true').expect(400);
  });

  it('returns equivalent detail by slug and numeric id, with sanitized HTML and TOC only publicly', async () => {
    const bySlug = await get('articles/typescript-guide').expect(200);
    const byId = await get(`articles/${articleId}`).expect(200);
    expect(bySlug.body).toEqual(byId.body);
    const detail = z
      .object({
        contentHtml: z.string(),
        toc: z.array(z.object({ id: z.string(), text: z.string(), level: z.number() })),
        publishedAt: z.iso.datetime(),
      })
      .passthrough()
      .parse(bySlug.body);
    expect(detail.contentHtml).toContain('<code>safe()</code>');
    expect(detail.toc).toEqual([{ id: 'introduction', text: 'Introduction', level: 1 }]);
    expect(detail).not.toHaveProperty('bodyMarkdown');
    const admin = await get(`admin/articles/${articleId}`).set('Cookie', cookie).expect(200);
    expect(entitySchema.parse(admin.body).bodyMarkdown).toContain('# Introduction');
    await get('articles/99999999999999999999999999999').expect(404);
  });

  it('ranks related matches before newer unrelated articles, and excludes the current article', async () => {
    const related = pageSchema.parse(
      (await get('articles/typescript-guide/related?limit=3').expect(200)).body,
    );
    expect(related.items.map((item) => item.slug)).toEqual(['related-guide', 'travel-notes']);
    expect(related.items.map((item) => item.id)).not.toContain(articleId);
    await get('articles/typescript-guide/related?limit=11').expect(400);
  });

  it('rejects duplicate slugs as 409 and requires publication dates', async () => {
    const conflict = await post(
      'admin/articles',
      articlePayload({ slug: 'typescript-guide' }),
    ).expect(409);
    expect(JSON.stringify(conflict.body).toLowerCase()).toMatch(/unique|exist|conflict/);
    await post('admin/articles', articlePayload({ status: 'PUBLISHED' })).expect(400);
    await post('admin/articles', articlePayload({ slug: '123' })).expect(400);
    await post('admin/articles', articlePayload({ categoryId: 999999 })).expect(404);
  });

  it('removes active scripts, handlers and unsafe schemes from public Markdown rendering', async () => {
    await patch(`admin/articles/${articleId}`, {
      bodyMarkdown:
        '# Safe\n\n<script>bad()</script>\n\n<img src=x onerror="bad()">\n\n[Danger](javascript:bad%28%29)\n\n<iframe src=x></iframe>',
    }).expect(200);
    const detail = z
      .object({ contentHtml: z.string() })
      .parse((await get(`articles/${articleId}`).expect(200)).body);
    expect(detail.contentHtml).not.toMatch(/<(script|iframe)\b/i);
    expect(detail.contentHtml).not.toMatch(/<[^>]+\son\w+=/i);
    expect(detail.contentHtml).not.toMatch(/(?:href|src)="javascript:/i);
  });

  it('exposes only visible resources, all with paginated envelopes and stable order', async () => {
    await prisma.book.update({ where: { id: bookId }, data: { isVisible: false } });
    await prisma.game.update({ where: { id: gameId }, data: { isVisible: false } });
    expect(pageSchema.parse((await get('books').expect(200)).body).total).toBe(0);
    expect(pageSchema.parse((await get('games').expect(200)).body).total).toBe(0);
    expect(pageSchema.parse((await get('photos').expect(200)).body).items).toEqual([]);
    expect(pageSchema.parse((await get('categories').expect(200)).body).total).toBe(2);
    expect(pageSchema.parse((await get('social-links').expect(200)).body).total).toBe(1);
    const skills = pageSchema.parse((await get('skills').expect(200)).body);
    expect(skills.items.map((item) => item.iconKey)).toEqual(['postgresql', 'react']);
    expect(skills.items.every((item) => !('svg' in item))).toBe(true);
    expect(pageSchema.parse((await get('tags').expect(200)).body).total).toBe(1);
    expect((await get('site-profile').expect(200)).body).toMatchObject({
      displayName: 'Test Author',
    });
  });

  it('does not leak tags belonging solely to hidden-category articles', async () => {
    const hiddenArticle = await prisma.article.findUniqueOrThrow({
      where: { slug: 'hidden-category-article' },
    });
    await prisma.tag.create({
      data: {
        name: 'Hidden Tag',
        slug: 'hidden-tag',
        articles: { create: [{ articleId: hiddenArticle.id }] },
      },
    });
    const tags = pageSchema.parse((await get('tags').expect(200)).body);
    expect(tags.items.map((item) => item.slug)).not.toContain('hidden-tag');
  });

  it('supports administrator create / get / update / delete for every content resource', async () => {
    const photoOriginal = await prisma.mediaAsset.create({
      data: {
        objectKey: `media/test/${randomUUID()}.webp`,
        mimeType: 'image/webp',
        sizeBytes: 10,
        kind: 'PHOTO_ORIGINAL',
      },
    });
    const photoThumbnail = await prisma.mediaAsset.create({
      data: {
        objectKey: `media/test/${randomUUID()}.webp`,
        mimeType: 'image/webp',
        sizeBytes: 10,
        kind: 'PHOTO_THUMBNAIL',
      },
    });
    const cases = [
      { resource: 'articles', create: articlePayload(), update: { title: 'Updated Article' } },
      {
        resource: 'categories',
        create: { key: 'new-category', label: 'New Category' },
        update: { label: 'Updated Category' },
      },
      {
        resource: 'tags',
        create: { slug: 'new-tag', name: 'New Tag' },
        update: { name: 'Updated Tag' },
      },
      {
        resource: 'books',
        create: {
          title: 'New Book',
          author: 'Writer',
          coverMediaId: coverId,
          accent: '#aabbcc',
          readingOrder: 2,
        },
        update: { title: 'Updated Book' },
      },
      {
        resource: 'games',
        create: {
          title: 'New Game',
          coverMediaId: coverId,
          rating: 0,
          playtimeHours: 0,
          likeLevel: 0,
        },
        update: { title: 'Updated Game' },
      },
      {
        resource: 'photos',
        create: {
          title: 'New Photo',
          originalMediaId: photoOriginal.id,
          thumbnailMediaId: photoThumbnail.id,
          alt: 'Photo',
          description: '',
        },
        update: { title: 'Updated Photo' },
      },
      {
        resource: 'skills',
        create: { name: 'New Skill', iconKey: 'new' },
        update: { name: 'Updated Skill' },
      },
      {
        resource: 'social-links',
        create: {
          name: 'New Social',
          platform: 'github',
          iconKey: 'github',
          url: 'https://github.com/example',
        },
        update: { name: 'Updated Social' },
      },
    ];
    for (const item of cases) {
      const created = entitySchema.parse(
        (await post(`admin/${item.resource}`, item.create).expect(201)).body,
      );
      await get(`admin/${item.resource}/${created.id}`).set('Cookie', cookie).expect(200);
      expect(
        (await patch(`admin/${item.resource}/${created.id}`, item.update).expect(200)).body,
      ).toMatchObject(item.update);
      await remove(`admin/${item.resource}/${created.id}`).expect(204);
      await get(`admin/${item.resource}/${created.id}`).set('Cookie', cookie).expect(404);
    }
    await patch('admin/site-profile', { displayName: 'Updated Author' }).expect(200);
    expect((await get('site-profile').expect(200)).body).toMatchObject({
      displayName: 'Updated Author',
    });
  });

  it('reorders content atomically and rejects duplicate or missing ids', async () => {
    const skills = await prisma.skill.findMany({
      where: { isVisible: true },
      orderBy: { id: 'asc' },
    });
    const first = z.number().parse(skills[0]?.id);
    const second = z.number().parse(skills[1]?.id);
    await patch('admin/skills/reorder', {
      items: [
        { id: first, sortOrder: 0 },
        { id: second, sortOrder: 1 },
      ],
    }).expect(204);
    expect(
      pageSchema.parse((await get('skills').expect(200)).body).items.map((item) => item.id),
    ).toEqual([first, second]);
    await patch('admin/skills/reorder', {
      items: [
        { id: first, sortOrder: 7 },
        { id: first, sortOrder: 8 },
      ],
    }).expect(400);
    await patch('admin/skills/reorder', {
      items: [
        { id: first, sortOrder: 7 },
        { id: 999999, sortOrder: 8 },
      ],
    }).expect(404);
    expect((await prisma.skill.findUniqueOrThrow({ where: { id: first } })).sortOrder).toBe(0);
  });

  it.each([
    ['books', 'progress', -1],
    ['books', 'progress', 101],
    ['games', 'rating', -0.1],
    ['games', 'rating', 10.1],
    ['games', 'likeLevel', -1],
    ['games', 'likeLevel', 6],
    ['games', 'playtimeHours', -1],
    ['games', 'playtimeHours', 1.5],
  ] as const)('rejects invalid %s.%s = %s in DTO validation', async (resource, field, value) => {
    await patch(`admin/${resource}/${resource === 'books' ? bookId : gameId}`, {
      [field]: value,
    }).expect(400);
  });

  it('persists reading notes, publishes them verbatim, preserves omitted notes and allows clearing', async () => {
    const readingNotes = '第一段心得。\n\n<script>这是纯文本，不应执行</script>';
    await patch(`admin/books/${bookId}`, { readingNotes }).expect(200);
    expect(await prisma.book.findUniqueOrThrow({ where: { id: bookId } })).toMatchObject({
      readingNotes,
    });
    const page = pageSchema.parse((await get('books').expect(200)).body);
    expect(page.items.find((item) => item.id === bookId)).toMatchObject({ readingNotes });
    const updated = entitySchema.parse(
      (await patch(`admin/books/${bookId}`, { progress: 42 }).expect(200)).body,
    );
    expect(updated.readingNotes).toBe(readingNotes);
    await patch(`admin/books/${bookId}`, { readingNotes: null }).expect(400);
    await patch(`admin/books/${bookId}`, { readingNotes: 'a'.repeat(50001) }).expect(400);
    const cleared = entitySchema.parse(
      (await patch(`admin/books/${bookId}`, { readingNotes: '' }).expect(200)).body,
    );
    expect(cleared.readingNotes).toBe('');
  });

  it('preserves zero values and permits range endpoints', async () => {
    await patch(`admin/books/${bookId}`, { progress: 100 }).expect(200);
    const book = entitySchema.parse(
      (await patch(`admin/books/${bookId}`, { progress: 0 }).expect(200)).body,
    );
    expect(book.progress).toBe(0);
    await patch(`admin/games/${gameId}`, { rating: 10, likeLevel: 5, playtimeHours: 0 }).expect(
      200,
    );
    const game = entitySchema.parse(
      (await patch(`admin/games/${gameId}`, { rating: 0, likeLevel: 0 }).expect(200)).body,
    );
    expect(game).toMatchObject({ rating: 0, likeLevel: 0, playtimeHours: 0 });
  });

  it('enforces real PostgreSQL CHECK constraints independently of DTOs', async () => {
    for (const value of [-1, 101]) {
      await expect(
        sql.query('UPDATE books SET progress = $1 WHERE id = $2', [value, bookId]),
      ).rejects.toMatchObject({ code: '23514' });
    }
    for (const [statement, value] of [
      ['UPDATE games SET rating = $1 WHERE id = $2', -0.1],
      ['UPDATE games SET rating = $1 WHERE id = $2', 10.1],
      ['UPDATE games SET "likeLevel" = $1 WHERE id = $2', -1],
      ['UPDATE games SET "likeLevel" = $1 WHERE id = $2', 6],
      ['UPDATE games SET "playtimeHours" = $1 WHERE id = $2', -1],
    ] as const) {
      await expect(sql.query(statement, [value, gameId])).rejects.toMatchObject({ code: '23514' });
    }
  });

  it('cascades user session deletion and refuses referenced category/media removal', async () => {
    await remove(`admin/categories/${categoryId}`).expect(409);
    await remove(`admin/media/${coverId}`).expect(409);
    await prisma.adminUser.delete({ where: { id: adminId } });
    expect(await prisma.adminSession.count()).toBe(0);
    await get('admin/articles').set('Cookie', cookie).expect(401);
  });

  it('validates multipart extension, declared MIME, magic bytes, missing files and size', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#aabbcc' } })
      .png()
      .toBuffer();
    const upload = (): request.Test =>
      request(server).post('/admin/media/images').set('Cookie', cookie).set('Origin', origin);
    await upload().expect(400);
    await upload()
      .attach('file', Buffer.from('<svg></svg>'), {
        filename: 'unsafe.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);
    await upload()
      .attach('file', png, { filename: 'wrong.jpg', contentType: 'image/png' })
      .expect(400);
    await upload()
      .attach('file', png, { filename: 'wrong.png', contentType: 'image/jpeg' })
      .expect(400);
    await upload()
      .attach('file', Buffer.from('Not a PNG'), { filename: 'fake.png', contentType: 'image/png' })
      .expect(400);
    await upload()
      .attach('file', Buffer.alloc(1024 * 1024 + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(await prisma.mediaAsset.count()).toBe(1);
  });

  it('uploads re-encoded images to real storage, strips EXIF and deletes unreferenced objects', async () => {
    const jpeg = await sharp({
      create: { width: 48, height: 32, channels: 3, background: '#aabbcc' },
    })
      .withExif({ IFD0: { Copyright: 'sensitive test metadata' } })
      .jpeg()
      .toBuffer();
    const response = await request(server)
      .post('/admin/media/images')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .field('purpose', 'IMAGE')
      .field('altText', 'Uploaded Cover')
      .attach('file', jpeg, { filename: 'my-private-filename.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const asset = z.object({ asset: mediaSchema }).parse(response.body).asset;
    expect(asset).toMatchObject({
      mimeType: 'image/webp',
      width: 48,
      height: 32,
      altText: 'Uploaded Cover',
      kind: 'IMAGE',
    });
    expect(asset.url).not.toContain('my-private-filename');
    const stored = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(stored.objectKey).toMatch(/^media\/\d{4}\/\d{2}\/[0-9a-f-]+\.webp$/);
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: stored.objectKey }));
    const bytes = await object.Body?.transformToByteArray();
    expect(bytes).toBeDefined();
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    await remove(`admin/media/${asset.id}`).expect(204);
    expect(await prisma.mediaAsset.findUnique({ where: { id: asset.id } })).toBeNull();
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: bucket, Key: stored.objectKey })),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  });

  it('creates separate display and thumbnail assets for photos and enforces both references', async () => {
    const png = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#112233' },
    })
      .png()
      .toBuffer();
    const uploaded = await request(server)
      .post('/admin/media/images')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .field('purpose', 'PHOTO')
      .field('altText', 'Landscape')
      .attach('file', png, { filename: 'landscape.png', contentType: 'image/png' })
      .expect(201);
    const pair = z.object({ original: mediaSchema, thumbnail: mediaSchema }).parse(uploaded.body);
    expect(pair.original.kind).toBe('PHOTO_ORIGINAL');
    expect(pair.thumbnail.kind).toBe('PHOTO_THUMBNAIL');
    expect(pair.thumbnail.width).toBeLessThanOrEqual(640);
    expect(pair.original.id).not.toBe(pair.thumbnail.id);
    const photo = entitySchema.parse(
      (
        await post('admin/photos', {
          originalMediaId: pair.original.id,
          thumbnailMediaId: pair.thumbnail.id,
          alt: 'Landscape',
          title: 'Landscape',
          description: 'A photo',
        }).expect(201)
      ).body,
    );
    await remove(`admin/media/${pair.original.id}`).expect(409);
    await remove(`admin/media/${pair.thumbnail.id}`).expect(409);
    await remove(`admin/photos/${photo.id}`).expect(204);
    await remove(`admin/media/${pair.original.id}`).expect(204);
    await remove(`admin/media/${pair.thumbnail.id}`).expect(204);
  });
});

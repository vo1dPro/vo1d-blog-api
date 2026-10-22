import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTweet } from 'react-tweet/api';
import type { Tweet } from 'react-tweet/api';
import type { PrismaService } from '../database/prisma.service.js';
import { CreationsService } from './creations.service.js';
import { fromXTweet, xPostId } from './x-adapter.js';
import { XTextResolver } from './x-text.js';

vi.mock('react-tweet/api', () => ({ getTweet: vi.fn() }));
const tweet = {
  id_str: '2112140462157132128', created_at: '2026-10-20T00:00:00Z', text: 'hello &lt;world&gt;',
  user: { name: 'vo1d', screen_name: 'vo1dZzz', profile_image_url_https: 'https://pbs.twimg.com/avatar.jpg', verified: false, is_blue_verified: false },
} as Tweet;

describe('creation import and deletion boundaries', () => {
  const rows = { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() };
  const database = { creationPost: rows, $transaction: vi.fn() };
  let service: CreationsService;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(XTextResolver.prototype, 'resolveDetails').mockResolvedValue(undefined);
    service = new CreationsService(database as unknown as PrismaService);
    database.$transaction.mockImplementation((work: (transaction: typeof database) => unknown) => work(database));
    vi.mocked(getTweet).mockResolvedValue(tweet);
    rows.findUnique.mockResolvedValue(null);
  });
  it('only accepts a fixed X URL, never an arbitrary fetch destination', () => {
    expect(xPostId('https://x.com/vo1dZzz/status/2112140462157132128?s=20')).toBe(tweet.id_str);
    for (const url of ['http://x.com/vo1dZzz/status/2112140462157132128', 'https://x.com.evil.test/u/status/2112140462157132128', 'https://user@x.com/u/status/2112140462157132128', 'https://x.com/vo1dZzz']) {
      expect(() => xPostId(url)).toThrow();
    }
  });
  it('checks actual upstream author, not the supplied URL username', () => {
    expect(() => fromXTweet(tweet, 'someone_else')).toThrow();
    expect(fromXTweet(tweet, 'VO1DZZZ').body[0]?.text).toBe('hello <world>');
  });
  it('enriches complete snapshots at read time while preserving missing counts and rich text', async () => {
    const payload = { ...fromXTweet(tweet, 'vo1dZzz'), metrics: { likes: 5 } };
    rows.findMany.mockResolvedValue([{ payload }]);
    rows.count.mockResolvedValue(1);
    vi.spyOn(XTextResolver.prototype, 'resolveDetails').mockResolvedValue({ text: 'plain text', metrics: { replies: 1, reposts: 0, quotes: 0, views: 71 } });
    const feed = await service.feed({ page: 1, pageSize: 50 });
    expect(feed.items[0]).toMatchObject({ body: payload.body, metrics: { likes: 5, replies: 1, reposts: 0, quotes: 0, views: 71 } });
    vi.spyOn(XTextResolver.prototype, 'resolveDetails').mockResolvedValue(undefined);
    expect((await service.feed({ page: 1, pageSize: 50 })).items[0]).toEqual(payload);
  });
  it('preserves real counts and does not confuse conversations with replies', () => {
    const result = fromXTweet({ ...tweet, favorite_count: 3, conversation_count: 8, text: '你好 #ChatGPT @vo1dZzz' }, 'vo1dZzz');
    expect(result.metrics).toEqual({ likes: 3 });
    expect(result.body).toContainEqual({ kind: 'hashtag', text: '#ChatGPT' });
    expect(result.body).toContainEqual({ kind: 'mention', text: '@vo1dZzz' });
    expect(fromXTweet({ ...tweet, favorite_count: -1 }, 'vo1dZzz').metrics).toEqual({});
  });
  it('blocks a deleted post before contacting upstream', async () => {
    rows.findUnique.mockResolvedValue({ deletedAt: new Date() });
    await expect(service.importX(`https://x.com/vo1dZzz/status/${tweet.id_str}`)).rejects.toThrow('删除');
    expect(getTweet).not.toHaveBeenCalled();
  });
  it('does not revive a tombstone created while the import was in flight', async () => {
    rows.upsert.mockResolvedValue({ deletedAt: new Date() });
    await expect(service.importX(`https://x.com/vo1dZzz/status/${tweet.id_str}`)).rejects.toThrow('删除');
    const call = rows.upsert.mock.calls[0]?.[0] as { update: unknown };
    expect(call.update).not.toHaveProperty('deletedAt');
  });
  it('deletion clears stored content but retains the deduplication row', async () => {
    rows.updateMany.mockResolvedValue({ count: 1 });
    await service.delete(1);
    const call = rows.updateMany.mock.calls[0]?.[0] as { where: unknown; data: { deletedAt: Date; payload: unknown } };
    expect(call.where).toEqual({ id: 1, deletedAt: null });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(call.data.payload).toEqual({});
  });
  it('reports already deleted or missing rows', async () => {
    rows.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.delete(100)).rejects.toThrow('不存在');
  });
});

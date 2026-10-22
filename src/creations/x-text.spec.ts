import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseXDetails, parseXText, XTextResolver } from './x-text.js';
const id = '2108175649945043091';
const full = '当互不信任的 AI 智能体开始相互协作，谁来验证身份？\n\n持续增长的商业价值';
const payload = { tweet: { id, text: full, author: { screen_name: 'vo1dZzz' } } };
afterEach(() => vi.unstubAllGlobals());
describe('full X text', () => {
  it('keeps zero counts distinct from missing data and rejects invalid counts', () => {
    expect(parseXDetails({ tweet: { ...payload.tweet, replies: 1, retweets: 0, quotes: 0, views: 71, likes: 5 } }, id, 'vo1dZzz')?.metrics)
      .toEqual({ replies: 1, reposts: 0, quotes: 0, views: 71, likes: 5 });
    expect(parseXDetails({ tweet: { ...payload.tweet, replies: -1, retweets: '3', quotes: null, views: 1.5 } }, id, 'vo1dZzz')?.metrics).toEqual({});
    expect(parseXDetails(payload, id, 'someone_else')).toBeUndefined();
  });
  it('retains the complete text and checks identity', () => {
    expect(parseXText(payload, id, 'VO1DZZZ')).toBe(full);
    expect(parseXText(payload, '123', 'vo1dZzz')).toBeUndefined();
    expect(parseXText(payload, id, 'other')).toBeUndefined();
    expect(parseXText({ tweet: { ...payload.tweet, text: '' } }, id, 'vo1dZzz')).toBeUndefined();
  });
  it('shares and caches requests', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetcher);
    const resolver = new XTextResolver();
    expect(await Promise.all([resolver.resolve(id, 'vo1dZzz'), resolver.resolve(id, 'vo1dZzz')])).toEqual([full, full]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('allows the caller to expose a fallback when upstream fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await new XTextResolver().resolve(id, 'vo1dZzz')).toBeUndefined();
  });
});

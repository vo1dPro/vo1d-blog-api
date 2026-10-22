import { afterEach, describe, expect, it, vi } from 'vitest';
import { articleIdInText, parseXArticle, XArticleResolver } from './x-article.js';

const postId = '2110631530829926857';
const articleId = '2110627973758169089';
const payload = { tweet: { id: postId, author: { screen_name: 'vo1dZzz' }, article: {
  id: articleId, title: 'Polymarket 文章', preview_text: '摘要',
  cover_media: { media_info: { original_img_url: 'https://pbs.twimg.com/media/cover.jpg' } },
} } };

afterEach(() => vi.unstubAllGlobals());
describe('X article preview', () => {
  it('recognizes article URLs and rejects lookalike hosts', () => {
    expect(articleIdInText(`正文 https://x.com/i/article/${articleId}`)).toBe(articleId);
    expect(articleIdInText(`https://x.com.evil.test/i/article/${articleId}`)).toBeUndefined();
  });
  it('matches post, article and author before accepting a preview', () => {
    expect(parseXArticle(payload, postId, articleId, 'VO1DZZZ')).toMatchObject({ title: 'Polymarket 文章', excerpt: '摘要' });
    expect(parseXArticle(payload, '1234567890123', articleId, 'vo1dZzz')).toBeUndefined();
    expect(parseXArticle(payload, postId, '1234567890123', 'vo1dZzz')).toBeUndefined();
    expect(parseXArticle(payload, postId, articleId, 'other')).toBeUndefined();
    expect(parseXArticle({ tweet: {} }, postId, articleId, 'vo1dZzz')).toBeUndefined();
  });
  it('shares concurrent requests and caches successes', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    vi.stubGlobal('fetch', fetcher);
    const resolver = new XArticleResolver();
    const results = await Promise.all([resolver.resolve(postId, articleId, 'vo1dZzz'), resolver.resolve(postId, articleId, 'vo1dZzz')]);
    expect(results[0]?.coverUrl).toContain('pbs.twimg.com');
    await resolver.resolve(postId, articleId, 'vo1dZzz');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('fails softly and caches provider failures', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    const resolver = new XArticleResolver();
    expect(await resolver.resolve(postId, articleId, 'vo1dZzz')).toBeUndefined();
    expect(await resolver.resolve(postId, articleId, 'vo1dZzz')).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

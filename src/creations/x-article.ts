import { z } from 'zod';
import { StaleWhileRevalidateCache } from './upstream-cache.js';

const articleSchema = z.object({
  id: z.string().regex(/^\d{10,25}$/),
  title: z.string().trim().min(1),
  preview_text: z.string().optional(),
  cover_media: z.object({ media_info: z.object({
    original_img_url: z.string().url(),
  }) }).optional(),
});

interface XArticle {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  coverUrl?: string;
}

export function articleIdInText(text: string): string | undefined {
  return /https:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/article\/(\d{10,25})(?=[\s?#]|$)/.exec(text)?.[1];
}

export function parseXArticle(value: unknown, postId: string, articleId: string, owner: string): XArticle | undefined {
  const result = z.object({ tweet: z.object({
    id: z.string(), author: z.object({ screen_name: z.string() }), article: articleSchema,
  }) }).safeParse(value);
  if (!result.success) return;
  const { tweet } = result.data;
  if (tweet.id !== postId || tweet.author.screen_name.toLowerCase() !== owner.toLowerCase() || tweet.article.id !== articleId) return;
  const article = tweet.article;
  const cover = article.cover_media?.media_info.original_img_url;
  const url = cover ? new URL(cover) : undefined;
  const coverUrl = url?.protocol === 'https:' && url.hostname === 'pbs.twimg.com' && !url.username && !url.password ? url.href : undefined;
  return { id: article.id, url: `https://x.com/i/article/${article.id}`, title: article.title,
    excerpt: article.preview_text ?? '', ...(coverUrl ? { coverUrl } : {}) };
}

/** Cache both successes and failures; concurrent readers share one upstream request. */
export class XArticleResolver {
  private readonly cache = new StaleWhileRevalidateCache<XArticle>(3_600_000, 60_000);

  resolve(postId: string, articleId: string, owner: string): Promise<XArticle | undefined> {
    return this.cache.get(`${owner}:${postId}:${articleId}`, () => this.fetch(postId, articleId, owner));
  }

  private async fetch(postId: string, articleId: string, owner: string) {
    try {
      const response = await fetch(`https://api.fxtwitter.com/status/${postId}`, {
        signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' }, redirect: 'error',
      });
      if (!response.ok) return;
      const value: unknown = await response.json();
      return parseXArticle(value, postId, articleId, owner);
    } catch { return undefined; } // Keep the original link when the optional provider is unavailable.
  }
}

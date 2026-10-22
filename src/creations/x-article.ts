import { z } from 'zod';

const articleSchema = z.object({
  id: z.string().regex(/^\d{10,25}$/),
  title: z.string().trim().min(1),
  preview_text: z.string().optional(),
  cover_media: z.object({ media_info: z.object({
    original_img_url: z.string().url(),
  }) }).optional(),
});

export interface XArticle {
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
  private readonly cache = new Map<string, { expires: number; value: Promise<XArticle | undefined> }>();

  async resolve(postId: string, articleId: string, owner: string): Promise<XArticle | undefined> {
    const key = `${owner}:${postId}:${articleId}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const entry = { expires: Date.now() + 60_000, value: this.fetch(postId, articleId, owner) };
    this.cache.set(key, entry);
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!);
    const article = await entry.value;
    entry.expires = Date.now() + (article ? 3_600_000 : 60_000);
    return article;
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

import { z } from 'zod';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional().catch(undefined);
const tweetSchema = z.object({
  id: z.string(), text: z.string().min(1), author: z.object({ screen_name: z.string() }),
  replies: count, retweets: count, quotes: count, views: count, likes: count,
});

export function parseXDetails(value: unknown, id: string, owner: string) {
  const result = z.object({ tweet: tweetSchema }).safeParse(value);
  if (!result.success || result.data.tweet.id !== id || result.data.tweet.author.screen_name.toLowerCase() !== owner.toLowerCase()) return;
  const tweet = result.data.tweet;
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries({ replies: tweet.replies, reposts: tweet.retweets, quotes: tweet.quotes, views: tweet.views, likes: tweet.likes })) {
    if (value !== undefined) metrics[key] = value;
  }
  return { text: tweet.text, metrics };
}

export function parseXText(value: unknown, id: string, owner: string): string | undefined {
  return parseXDetails(value, id, owner)?.text;
}

export class XTextResolver {
  private readonly cache = new Map<string, { expires: number; value: Promise<ReturnType<typeof parseXDetails>> }>();

  async resolve(id: string, owner: string): Promise<string | undefined> {
    return (await this.resolveDetails(id, owner))?.text;
  }

  async resolveDetails(id: string, owner: string) {
    const key = `${owner}:${id}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const entry = { expires: Date.now() + 60_000, value: this.fetch(id, owner) };
    this.cache.set(key, entry);
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!);
    const text = await entry.value;
    entry.expires = Date.now() + (text ? 300_000 : 60_000);
    return text;
  }

  private async fetch(id: string, owner: string) {
    try {
      const response = await fetch(`https://api.fxtwitter.com/status/${id}`, {
        signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' }, redirect: 'error',
      });
      if (!response.ok) return;
      const value: unknown = await response.json();
      return parseXDetails(value, id, owner);
    } catch { return undefined; }
  }
}

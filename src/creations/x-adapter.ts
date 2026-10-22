import { BadRequestException } from '@nestjs/common';
import type { Tweet } from 'react-tweet/api';

export function xPostId(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new BadRequestException('请输入完整的 X 推文链接。'); }
  const id = /^\/[A-Za-z0-9_]+\/status\/(\d{10,25})\/?$/.exec(url.pathname)?.[1];
  if (url.protocol !== 'https:' || url.username || url.password || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname) || !id) {
    throw new BadRequestException('只支持 x.com 或 twitter.com 的单条推文链接。');
  }
  return id;
}

function decode(value: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (match, name: string) => entities[name] ?? match);
}

function normalizeContent(tweet: Pick<Tweet, 'user' | 'text' | 'entities' | 'mediaDetails' | 'photos' | 'video'>) {
  let text = tweet.text;
  for (const link of tweet.entities?.urls ?? []) text = text.replaceAll(link.url, link.expanded_url);
  for (const media of tweet.entities?.media ?? []) text = text.replaceAll(media.url, '');
  const media: { kind: 'image' | 'video'; alt: string; url?: string; posterUrl?: string; width?: number; height?: number }[] = [];
  for (const item of tweet.mediaDetails ?? []) {
    if (item.type === 'photo') media.push({
      kind: 'image', url: item.media_url_https, alt: item.ext_alt_text ?? '推文配图',
      width: item.original_info.width, height: item.original_info.height,
    });
    else {
      const source = item.video_info.variants.filter(v => v.content_type === 'video/mp4')
        .sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0))[0];
      media.push({
        kind: 'video', posterUrl: item.media_url_https, alt: '推文视频',
        ...(source ? { url: source.url } : {}),
        width: item.original_info.width, height: item.original_info.height,
      });
    }
  }
  if (!media.length) for (const photo of tweet.photos ?? []) media.push({
    kind: 'image', url: photo.url, alt: '推文配图', width: photo.width, height: photo.height,
  });
  return {
    author: {
      name: tweet.user.name, handle: tweet.user.screen_name,
      avatarUrl: tweet.user.profile_image_url_https,
      verified: tweet.user.verified || tweet.user.is_blue_verified,
    },
    body: decode(text.trim()).split(/(https?:\/\/[^\s]+|[#＃][\p{L}\p{N}_]+|@[A-Za-z0-9_]+)/gu).filter(Boolean).map(part => ({
      kind: /^https?:\/\//.test(part) ? 'link' : /^[#＃]/.test(part) ? 'hashtag' : part.startsWith('@') ? 'mention' : 'text',
      text: part,
    })),
    media,
  };
}

/** The same contract can be produced by future Douyin/Bilibili adapters. */
export function fromXTweet(tweet: Tweet, owner: string) {
  if (tweet.user.screen_name.toLowerCase() !== owner.toLowerCase()) {
    throw new BadRequestException(`只能导入 @${owner} 自己发布的推文。`);
  }
  const raw = tweet as unknown as Record<string, unknown>;
  const metrics: Record<string, number> = {};
  for (const [name, field] of Object.entries({ likes: 'favorite_count', replies: 'reply_count', reposts: 'retweet_count', quotes: 'quote_count', views: 'view_count' })) {
    const count = raw[field];
    if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) metrics[name] = count;
  }
  // conversation_count is not guaranteed to equal reply_count; do not substitute it.
  return {
    id: tweet.id_str, platform: 'x',
    sourceUrl: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
    publishedAt: new Date(tweet.created_at).toISOString(),
    metrics,
    textStatus: tweet.note_tweet ? 'truncated' : 'complete',
    ...normalizeContent(tweet),
    ...(tweet.quoted_tweet ? { quote: normalizeContent(tweet.quoted_tweet) } : {}),
  };
}

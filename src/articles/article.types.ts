import type { Prisma } from '../generated/prisma/client.js';
import type { MediaResponse } from '../media/media.types.js';
import type { TocItem } from './markdown.service.js';

export type ArticleWithRelations = Prisma.ArticleGetPayload<{
  include: {
    category: true;
    coverMedia: true;
    tags: { include: { tag: true } };
  };
}>;

export interface ArticleSummaryResponse {
  id: number;
  slug: string;
  title: string;
  summary: string;
  category: { id: number; key: string; label: string; iconKey: string | null };
  tags: { id: number; slug: string; name: string }[];
  publishedAt: string;
  cover: MediaResponse;
  readingTimeMinutes: number;
}

export interface ArticleDetailResponse extends ArticleSummaryResponse {
  contentHtml: string;
  toc: TocItem[];
  seoTitle: string | null;
  seoDescription: string | null;
}

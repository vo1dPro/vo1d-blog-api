import { layoutSchema } from './layout.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getTweet } from 'react-tweet/api';
import { PrismaService } from '../database/prisma.service.js';
import type { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { fromXTweet, xPostId } from './x-adapter.js';
import { articleIdInText, XArticleResolver } from './x-article.js';
import type { Prisma } from '../generated/prisma/client.js';
import { XTextResolver } from './x-text.js';

@Injectable()
export class CreationsService {
  readonly owner = 'vo1dZzz';
  private readonly articles = new XArticleResolver();
  private readonly texts = new XTextResolver();
  constructor(private readonly prisma: PrismaService) {}

  async layout() {
    const row = await this.prisma.creationLayout.findUniqueOrThrow({ where: { id: 1 } });
    return layoutSchema.parse({ ...(row.config as object), revision: row.revision });
  }
  async saveLayout(input: unknown) {
    const parsed = layoutSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('布局格式、分类名称或分类关联无效');
    const { revision, ...config } = parsed.data;
    return this.prisma.$transaction(async (tx) => {
      const posts = await tx.creationPost.findMany({
        where: { deletedAt: null },
        select: { platform: true, externalId: true },
      });
      const ids = new Set(posts.map((p) => `${p.platform}:${p.externalId}`));
      if (config.entries.some((e) => !ids.has(e.id)))
        throw new ConflictException('部分动态已被删除，请刷新工作台后重试');
      const result = await tx.creationLayout.updateMany({
        where: { id: 1, revision },
        data: { revision: { increment: 1 }, config },
      });
      if (!result.count)
        throw new ConflictException('另一窗口已保存新版本，请刷新后重试；你的修改尚未保存');
      return { ...config, revision: revision + 1 };
    });
  }

  private async withFullText(payload: Prisma.InputJsonObject): Promise<Prisma.InputJsonObject> {
    if (
      payload.platform !== 'x' ||
      typeof payload.id !== 'string' ||
      !/^\d{10,25}$/.test(payload.id)
    )
      return payload;
    const details = await this.texts.resolveDetails(payload.id, this.owner);
    if (!details)
      return payload.textStatus === 'complete'
        ? payload
        : { ...payload, textStatus: 'unavailable' };
    const existingMetrics =
      payload.metrics && typeof payload.metrics === 'object' && !Array.isArray(payload.metrics)
        ? payload.metrics
        : {};
    const enriched = { ...payload, metrics: { ...existingMetrics, ...details.metrics } };
    if (payload.textStatus === 'complete') return enriched;
    // Older snapshots did not retain note_tweet. Verify them once through the cache.
    return { ...enriched, body: [{ kind: 'text', text: details.text }], textStatus: 'complete' };
  }

  private async withArticle(payload: Prisma.JsonValue): Promise<Prisma.InputJsonObject> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
    const post = payload as Prisma.InputJsonObject;
    if (
      post.platform !== 'x' ||
      post.article ||
      typeof post.id !== 'string' ||
      !/^\d{10,25}$/.test(post.id) ||
      !Array.isArray(post.body)
    )
      return post;
    const text = post.body
      .map((part: unknown) =>
        part &&
        typeof part === 'object' &&
        !Array.isArray(part) &&
        'text' in part &&
        typeof part.text === 'string'
          ? part.text
          : '',
      )
      .join('');
    const id = articleIdInText(text);
    if (!id) return post;
    const article = await this.articles.resolve(post.id, id, this.owner);
    return article ? { ...post, article: { ...article } } : post;
  }

  async feed(query: PaginationQueryDto) {
    const rows = await this.prisma.creationPost.findMany({
      where: { deletedAt: null },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const total = await this.prisma.creationPost.count({ where: { deletedAt: null } });
    return {
      version: 1,
      mode: 'live',
      updatedAt: new Date().toISOString(),
      items: await Promise.all(
        rows.map(async (row) => this.withFullText(await this.withArticle(row.payload))),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async list(query: PaginationQueryDto) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.creationPost.findMany({
        where: { deletedAt: null },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.creationPost.count({ where: { deletedAt: null } }),
    ]);
    return {
      items: rows,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async importX(url: string) {
    const externalId = xPostId(url);
    const existing = await this.prisma.creationPost.findUnique({
      where: { platform_externalId: { platform: 'x', externalId } },
    });
    if (existing?.deletedAt) throw new ConflictException('这条动态已被删除，已阻止重新导入。');
    let tweet;
    try {
      tweet = await getTweet(externalId, { signal: AbortSignal.timeout(15000) });
    } catch {
      throw new ServiceUnavailableException('暂时无法连接 X，请稍后重试。');
    }
    if (!tweet) throw new NotFoundException('推文不存在、已转为私密或暂时不可读取。');
    const normalized = fromXTweet(tweet, this.owner);
    const payload = await this.withFullText(await this.withArticle(normalized));
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.creationPost.upsert({
        where: { platform_externalId: { platform: 'x', externalId } },
        create: {
          platform: 'x',
          externalId,
          sourceUrl: normalized.sourceUrl,
          publishedAt: new Date(normalized.publishedAt),
          payload,
        },
        // Never reset deletedAt; deletion racing an import remains a tombstone.
        update: {
          payload,
          sourceUrl: normalized.sourceUrl,
          publishedAt: new Date(normalized.publishedAt),
        },
      });
      if (row.deletedAt) throw new ConflictException('这条动态已被删除，已阻止重新导入。');
      return row;
    });
  }

  async delete(id: number) {
    const result = await this.prisma.creationPost.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), payload: {} },
    });
    if (!result.count) throw new NotFoundException('动态不存在或已被删除。');
  }
}

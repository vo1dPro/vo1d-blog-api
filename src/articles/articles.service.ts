import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateArticleDto, UpdateArticleDto } from './dto/article.dto.js';
import type { ArticleListQueryDto } from './dto/article.dto.js';
import type { PaginatedResponseDto } from '../common/dto/pagination.dto.js';
import { nullableText } from '../common/text.js';
import { PrismaService } from '../database/prisma.service.js';
import { ArticleStatus, Prisma } from '../generated/prisma/client.js';
import { MediaService } from '../media/media.service.js';
import { MarkdownService } from './markdown.service.js';
import type {
  ArticleDetailResponse,
  ArticleSummaryResponse,
  ArticleWithRelations,
} from './article.types.js';

const relations = {
  category: true,
  coverMedia: true,
  tags: { include: { tag: true } },
} as const;

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly markdownService: MarkdownService,
  ) {}

  async listPublic(query: ArticleListQueryDto): Promise<{
    items: ArticleSummaryResponse[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const now = new Date();
    const search = query.q?.trim();
    const where: Prisma.ArticleWhereInput = {
      status: ArticleStatus.PUBLISHED,
      publishedAt: { not: null, lte: now },
      category: {
        isVisible: true,
        ...(query.category === undefined || query.category === 'all'
          ? {}
          : { key: query.category }),
      },
      ...(query.tag === undefined ? {} : { tags: { some: { tag: { slug: query.tag } } } }),
      ...(search === undefined || search.length === 0
        ? {}
        : {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { summary: { contains: search, mode: 'insensitive' } },
            ],
          }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        include: relations,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.article.count({ where }),
    ]);
    return {
      items: items.map((article) => this.toSummary(article)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async getPublic(slugOrId: string): Promise<ArticleDetailResponse> {
    const article = await this.findPublicArticle(slugOrId);
    return this.toDetail(article);
  }

  async related(
    slugOrId: string,
    limit: number,
  ): Promise<PaginatedResponseDto<ArticleSummaryResponse>> {
    const current = await this.findPublicArticle(slugOrId);
    const now = new Date();
    // Rank inside PostgreSQL and fetch only the requested IDs, avoiding unbounded body loads.
    const ranked = await this.prisma.$queryRaw<{ id: number; total: bigint }[]>`
      SELECT a.id, count(*) OVER() AS total
      FROM articles a JOIN categories c ON c.id = a."categoryId"
      WHERE a.id <> ${current.id} AND a.status = 'PUBLISHED'
        AND a."publishedAt" <= ${now} AND c."isVisible" = true
      ORDER BY (
        (SELECT count(*) * 2 FROM article_tags t JOIN article_tags mine ON mine."tagId" = t."tagId"
          WHERE t."articleId" = a.id AND mine."articleId" = ${current.id})
        + CASE WHEN a."categoryId" = ${current.categoryId} THEN 1 ELSE 0 END
      ) DESC, a."publishedAt" DESC, a.id DESC LIMIT ${limit}
    `;
    const candidates = await this.prisma.article.findMany({
      where: {
        id: { in: ranked.map((row) => row.id) },
        status: ArticleStatus.PUBLISHED,
        publishedAt: { not: null, lte: now },
        category: { isVisible: true },
      },
      include: relations,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
    const order = new Map(ranked.map((row, index) => [row.id, index]));
    candidates.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const total = Number(ranked[0]?.total ?? 0);
    return {
      items: candidates.map((article) => this.toSummary(article)),
      page: 1,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listAdmin(
    query: ArticleListQueryDto,
  ): Promise<PaginatedResponseDto<Record<string, unknown>>> {
    const where: Prisma.ArticleWhereInput = {
      ...(query.category ? { category: { key: query.category } } : {}),
      ...(query.tag ? { tags: { some: { tag: { slug: query.tag } } } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { summary: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [articles, total] = await this.prisma.$transaction(
      [
        this.prisma.article.findMany({
          where,
          take: query.pageSize,
          skip: (query.page - 1) * query.pageSize,
          include: relations,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.article.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: articles.map((article) => this.toAdmin(article)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async getAdmin(id: number): Promise<Record<string, unknown>> {
    const article = await this.prisma.article.findUnique({ where: { id }, include: relations });
    if (article === null) {
      throw new NotFoundException('Article not found');
    }
    return this.toAdmin(article);
  }

  async create(input: CreateArticleDto): Promise<Record<string, unknown>> {
    this.assertPublication(input.status ?? ArticleStatus.DRAFT, input.publishedAt);
    await this.assertReferences(input.categoryId, input.coverMediaId, input.tagIds);
    const article = await this.prisma.article.create({
      data: {
        slug: input.slug,
        title: input.title,
        summary: input.summary,
        bodyMarkdown: input.bodyMarkdown,
        categoryId: input.categoryId,
        coverMediaId: input.coverMediaId,
        status: input.status ?? ArticleStatus.DRAFT,
        publishedAt:
          input.publishedAt === null || input.publishedAt === undefined
            ? null
            : new Date(input.publishedAt),
        readingTimeMinutes: input.readingTimeMinutes,
        seoTitle: nullableText(input.seoTitle),
        seoDescription: nullableText(input.seoDescription),
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
      include: relations,
    });
    return this.toAdmin(article);
  }

  async update(id: number, input: UpdateArticleDto): Promise<Record<string, unknown>> {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (existing === null) {
      throw new NotFoundException('Article not found');
    }
    const effectiveStatus = input.status ?? existing.status;
    const effectivePublishedAt =
      input.publishedAt === undefined ? existing.publishedAt?.toISOString() : input.publishedAt;
    this.assertPublication(effectiveStatus, effectivePublishedAt);
    await this.assertReferences(
      input.categoryId ?? existing.categoryId,
      input.coverMediaId ?? existing.coverMediaId,
      input.tagIds,
    );

    const article = await this.prisma.article.update({
      where: { id },
      data: {
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.bodyMarkdown === undefined ? {} : { bodyMarkdown: input.bodyMarkdown }),
        ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
        ...(input.coverMediaId === undefined ? {} : { coverMediaId: input.coverMediaId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.publishedAt === undefined
          ? {}
          : { publishedAt: input.publishedAt === null ? null : new Date(input.publishedAt) }),
        ...(input.readingTimeMinutes === undefined
          ? {}
          : { readingTimeMinutes: input.readingTimeMinutes }),
        ...(input.seoTitle === undefined ? {} : { seoTitle: nullableText(input.seoTitle) }),
        ...(input.seoDescription === undefined
          ? {}
          : { seoDescription: nullableText(input.seoDescription) }),
        ...(input.tagIds === undefined
          ? {}
          : {
              tags: {
                deleteMany: {},
                create: input.tagIds.map((tagId) => ({ tagId })),
              },
            }),
      },
      include: relations,
    });
    return this.toAdmin(article);
  }

  async delete(id: number): Promise<void> {
    const result = await this.prisma.article.deleteMany({ where: { id } });
    if (result.count === 0) {
      throw new NotFoundException('Article not found');
    }
  }

  private async findPublicArticle(slugOrId: string): Promise<ArticleWithRelations> {
    const id = /^\d+$/.test(slugOrId) ? Number(slugOrId) : undefined;
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1 || id > 2147483647))
      throw new NotFoundException('Published article not found');
    const article = await this.prisma.article.findFirst({
      where: {
        ...(id === undefined ? { slug: slugOrId } : { id }),
        status: ArticleStatus.PUBLISHED,
        publishedAt: { not: null, lte: new Date() },
        category: { isVisible: true },
      },
      include: relations,
    });
    if (article === null) {
      throw new NotFoundException('Published article not found');
    }
    return article;
  }

  private async assertReferences(
    categoryId: number,
    coverMediaId: number,
    tagIds: number[] | undefined,
  ): Promise<void> {
    const [category, media, tagCount] = await this.prisma.$transaction([
      this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }),
      this.prisma.mediaAsset.findUnique({ where: { id: coverMediaId }, select: { id: true } }),
      this.prisma.tag.count({ where: { id: { in: tagIds ?? [] } } }),
    ]);
    if (category === null) {
      throw new NotFoundException('Category not found');
    }
    if (media === null) {
      throw new NotFoundException('Cover media asset not found');
    }
    if (tagIds !== undefined && tagCount !== tagIds.length) {
      throw new NotFoundException('One or more tags were not found');
    }
  }

  private assertPublication(status: ArticleStatus, publishedAt: string | null | undefined): void {
    if (status === ArticleStatus.PUBLISHED && (publishedAt === null || publishedAt === undefined)) {
      throw new BadRequestException('publishedAt is required when status is PUBLISHED');
    }
  }

  private toSummary(article: ArticleWithRelations): ArticleSummaryResponse {
    if (article.publishedAt === null) {
      throw new Error('A public article cannot have a null publishedAt');
    }
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      category: {
        id: article.category.id,
        key: article.category.key,
        label: article.category.label,
        iconKey: article.category.iconKey,
      },
      tags: article.tags
        .map(({ tag }) => ({ id: tag.id, slug: tag.slug, name: tag.name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      publishedAt: article.publishedAt.toISOString(),
      cover: this.mediaService.toResponse(article.coverMedia),
      readingTimeMinutes: article.readingTimeMinutes,
    };
  }

  private toDetail(article: ArticleWithRelations): ArticleDetailResponse {
    return {
      ...this.toSummary(article),
      ...this.markdownService.render(article.bodyMarkdown),
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
    };
  }

  private toAdmin(article: ArticleWithRelations): Record<string, unknown> {
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      bodyMarkdown: article.bodyMarkdown,
      categoryId: article.categoryId,
      category: article.category,
      tagIds: article.tags.map(({ tagId }) => tagId),
      tags: article.tags.map(({ tag }) => tag),
      coverMediaId: article.coverMediaId,
      cover: this.mediaService.toResponse(article.coverMedia),
      status: article.status,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      readingTimeMinutes: article.readingTimeMinutes,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    };
  }
}

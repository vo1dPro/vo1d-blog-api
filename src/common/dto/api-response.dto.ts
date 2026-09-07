import { ApiProperty, OmitType } from '@nestjs/swagger';
import { BookMediaResponseDto } from '../../books/dto/book-response.dto.js';
import { CategoryResponseDto } from '../../categories/dto/category-response.dto.js';
import { TagResponseDto } from '../../tags/dto/tag-response.dto.js';

export class MediaResponseDto extends BookMediaResponseDto {}
export class MediaUploadResponseDto {
  @ApiProperty({ type: MediaResponseDto }) asset!: MediaResponseDto;
}
export class PhotoUploadResponseDto {
  @ApiProperty({ type: MediaResponseDto }) original!: MediaResponseDto;
  @ApiProperty({ type: MediaResponseDto }) thumbnail!: MediaResponseDto;
}
export class PageMetadataDto {
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 50 }) pageSize!: number;
  @ApiProperty({ minimum: 0 }) total!: number;
  @ApiProperty({ minimum: 0 }) totalPages!: number;
}
export class MediaPageResponseDto extends PageMetadataDto {
  @ApiProperty({ type: [MediaResponseDto] }) items!: MediaResponseDto[];
}
export class ArticleCategoryDto extends OmitType(CategoryResponseDto, [
  'sortOrder',
  'isVisible',
  'createdAt',
  'updatedAt',
] as const) {}
export class ArticleTagDto extends OmitType(TagResponseDto, ['createdAt', 'updatedAt'] as const) {}
export class ArticleSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() summary!: string;
  @ApiProperty({ type: ArticleCategoryDto }) category!: ArticleCategoryDto;
  @ApiProperty({ type: [ArticleTagDto] }) tags!: ArticleTagDto[];
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
  @ApiProperty({ type: MediaResponseDto }) cover!: MediaResponseDto;
  @ApiProperty({ minimum: 1 }) readingTimeMinutes!: number;
}
export class TocItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ minimum: 1, maximum: 6 }) level!: number;
}
export class ArticleDetailDto extends ArticleSummaryDto {
  @ApiProperty({ description: 'Sanitized HTML; raw HTML in Markdown is escaped' })
  contentHtml!: string;
  @ApiProperty({ type: [TocItemDto] }) toc!: TocItemDto[];
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
}
export class ArticlePageResponseDto extends PageMetadataDto {
  @ApiProperty({ type: [ArticleSummaryDto] }) items!: ArticleSummaryDto[];
}
export class AdminArticleDto extends OmitType(ArticleSummaryDto, [
  'publishedAt',
  'category',
  'tags',
] as const) {
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) publishedAt!: string | null;
  @ApiProperty() bodyMarkdown!: string;
  @ApiProperty() categoryId!: number;
  @ApiProperty({ type: CategoryResponseDto }) category!: CategoryResponseDto;
  @ApiProperty({ type: [TagResponseDto] }) tags!: TagResponseDto[];
  @ApiProperty({ type: [Number] }) tagIds!: number[];
  @ApiProperty() coverMediaId!: number;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] }) status!: string;
  @ApiProperty({ type: String, nullable: true }) seoTitle!: string | null;
  @ApiProperty({ type: String, nullable: true }) seoDescription!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class AdminArticlePageDto extends PageMetadataDto {
  @ApiProperty({ type: [AdminArticleDto] }) items!: AdminArticleDto[];
}
export class SiteProfileResponseDto {
  @ApiProperty() displayName!: string;
  @ApiProperty() role!: string;
  @ApiProperty() heroTitlePrefix!: string;
  @ApiProperty() heroDescription!: string;
  @ApiProperty() learningNote!: string;
  @ApiProperty() footerMessage!: string;
  @ApiProperty({ type: MediaResponseDto, nullable: true }) avatar!: MediaResponseDto | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class AdminSiteProfileResponseDto extends SiteProfileResponseDto {
  @ApiProperty({ enum: [1] }) id!: number;
  @ApiProperty({ type: Number, nullable: true }) avatarMediaId!: number | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class AdminIdentityDto {
  @ApiProperty() id!: number;
  @ApiProperty({ format: 'email' }) email!: string;
}
export class LoginResponseDto {
  @ApiProperty({ type: AdminIdentityDto }) admin!: AdminIdentityDto;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'] }) status!: string;
  @ApiProperty({ enum: ['up'] }) database!: string;
  @ApiProperty({ format: 'date-time' }) timestamp!: string;
}

import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { MediaKind, type MediaAsset } from '../generated/prisma/client.js';
import type { MediaResponse, UploadPurpose } from './media.types.js';
import { StorageService } from './storage.service.js';
import { nullableText } from '../common/text.js';
import type { PaginationQueryDto, PaginatedResponseDto } from '../common/dto/pagination.dto.js';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  kind: MediaKind;
  objectKey: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
  ) {}

  toResponse(asset: MediaAsset): MediaResponse {
    return {
      id: asset.id,
      url: `${this.config.mediaPublicBaseUrl}/${asset.objectKey}`,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
      altText: asset.altText,
      kind: asset.kind,
      createdAt: asset.createdAt.toISOString(),
    };
  }

  async list(query: PaginationQueryDto): Promise<PaginatedResponseDto<MediaResponse>> {
    const [assets, total] = await this.prisma.$transaction(
      [
        this.prisma.mediaAsset.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.pageSize,
          skip: (query.page - 1) * query.pageSize,
        }),
        this.prisma.mediaAsset.count(),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: assets.map((asset) => this.toResponse(asset)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async upload(
    file: Express.Multer.File | undefined,
    purpose: UploadPurpose,
    altText?: string,
  ): Promise<{ asset: MediaResponse } | { original: MediaResponse; thumbnail: MediaResponse }> {
    if (file === undefined) {
      throw new BadRequestException('An image file is required');
    }
    if (file.size > this.config.mediaMaxUploadBytes) {
      throw new BadRequestException('Image exceeds the configured upload size limit');
    }
    await this.validateFile(file);

    const processed =
      purpose === 'PHOTO'
        ? await Promise.all([
            this.processImage(file.buffer, MediaKind.PHOTO_ORIGINAL, 2560, 90),
            this.processImage(file.buffer, MediaKind.PHOTO_THUMBNAIL, 640, 80),
          ])
        : [
            await this.processImage(
              file.buffer,
              MediaKind.IMAGE,
              purpose === 'ICON' ? 512 : 2560,
              88,
              purpose === 'ICON',
            ),
          ];

    const uploadedKeys: string[] = [];
    try {
      for (const image of processed) {
        uploadedKeys.push(image.objectKey);
        await this.storage.putObject(image.objectKey, image.buffer, 'image/webp');
      }

      const assets = await this.prisma.$transaction(
        processed.map((image) =>
          this.prisma.mediaAsset.create({
            data: {
              objectKey: image.objectKey,
              mimeType: 'image/webp',
              sizeBytes: image.buffer.byteLength,
              width: image.width,
              height: image.height,
              altText: nullableText(altText),
              kind: image.kind,
            },
          }),
        ),
      );

      const first = assets[0];
      if (first === undefined) {
        throw new InternalServerErrorException('No media asset was created');
      }
      if (purpose !== 'PHOTO') {
        return { asset: this.toResponse(first) };
      }
      const second = assets[1];
      if (second === undefined) {
        throw new InternalServerErrorException('Photo thumbnail was not created');
      }
      return { original: this.toResponse(first), thumbnail: this.toResponse(second) };
    } catch (error: unknown) {
      const cleanup = await Promise.allSettled(
        uploadedKeys.map((key) => this.storage.deleteObject(key)),
      );
      cleanup.forEach((result, index) => {
        if (result.status === 'rejected')
          this.logger.error(`Orphan cleanup required: ${uploadedKeys[index] ?? 'unknown key'}`);
      });
      throw error;
    }
  }

  async assertImageReferences(ids: readonly (number | null | undefined)[]): Promise<void> {
    for (const id of new Set(ids)) {
      if (id == null) continue;
      const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
      if (asset?.kind !== MediaKind.IMAGE)
        throw new BadRequestException('Icon must reference an existing IMAGE asset');
    }
  }

  async deleteUnreferenced(id: number): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (asset === null) {
      throw new NotFoundException('Media asset not found');
    }

    const [avatars, articles, books, games, photoOriginals, photoThumbnails, skills, socials] =
      await this.prisma.$transaction([
        this.prisma.siteProfile.count({ where: { avatarMediaId: id } }),
        this.prisma.article.count({ where: { coverMediaId: id } }),
        this.prisma.book.count({ where: { coverMediaId: id } }),
        this.prisma.game.count({ where: { coverMediaId: id } }),
        this.prisma.photo.count({ where: { originalMediaId: id } }),
        this.prisma.photo.count({ where: { thumbnailMediaId: id } }),
        this.prisma.skill.count({ where: { OR: [{ iconMediaId: id }, { darkIconMediaId: id }] } }),
        this.prisma.socialLink.count({
          where: { OR: [{ iconMediaId: id }, { darkIconMediaId: id }] },
        }),
      ]);
    const references =
      avatars + articles + books + games + photoOriginals + photoThumbnails + skills + socials;
    if (references > 0) {
      throw new ConflictException('Media asset is still referenced');
    }

    await this.prisma.mediaAsset.delete({ where: { id } });
    try {
      await this.storage.deleteObject(asset.objectKey);
    } catch (error: unknown) {
      this.logger.error(`Orphan cleanup required: ${asset.objectKey}`);
      throw new InternalServerErrorException(
        'Database record removed; storage cleanup failed and was logged for retry',
        { cause: error },
      );
    }
  }

  private async validateFile(file: Express.Multer.File): Promise<void> {
    const extension = extname(file.originalname).toLocaleLowerCase('en-US');
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('Only JPEG, PNG and WebP filename extensions are allowed');
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG and WebP MIME types are allowed');
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (detected === undefined || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new BadRequestException('File signature is not a supported image');
    }
    if (detected.mime !== file.mimetype) {
      throw new BadRequestException('Declared MIME type does not match the file signature');
    }
    const extensionMatches =
      (detected.mime === 'image/jpeg' && (extension === '.jpg' || extension === '.jpeg')) ||
      (detected.mime === 'image/png' && extension === '.png') ||
      (detected.mime === 'image/webp' && extension === '.webp');
    if (!extensionMatches) {
      throw new BadRequestException('Filename extension does not match the file signature');
    }
  }

  private async processImage(
    source: Buffer,
    kind: MediaKind,
    maxDimension: number,
    quality: number,
    lossless = false,
  ): Promise<ProcessedImage> {
    let output: Buffer;
    try {
      output = await sharp(source, { failOn: 'error', limitInputPixels: 80_000_000 })
        .rotate()
        .resize({
          width: maxDimension,
          height: maxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality, lossless })
        .toBuffer();
    } catch (error: unknown) {
      throw new BadRequestException('Image cannot be decoded safely', { cause: error });
    }
    const metadata = await sharp(output).metadata();
    if (metadata.width === undefined || metadata.height === undefined) {
      throw new BadRequestException('Image dimensions could not be determined');
    }
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return {
      buffer: output,
      width: metadata.width,
      height: metadata.height,
      kind,
      objectKey: `media/${now.getUTCFullYear()}/${month}/${randomUUID()}.webp`,
    };
  }
}

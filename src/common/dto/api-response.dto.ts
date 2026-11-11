import { ApiProperty } from '@nestjs/swagger';
import { BookMediaResponseDto } from '../../books/dto/book-response.dto.js';

export class MediaResponseDto extends BookMediaResponseDto {}
export class MediaUploadResponseDto {
  @ApiProperty({ type: MediaResponseDto }) asset!: MediaResponseDto;
}
export class PhotoUploadResponseDto {
  @ApiProperty({ type: MediaResponseDto }) original!: MediaResponseDto;
  @ApiProperty({ type: MediaResponseDto }) thumbnail!: MediaResponseDto;
}
class PageMetadataDto {
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 50 }) pageSize!: number;
  @ApiProperty({ minimum: 0 }) total!: number;
  @ApiProperty({ minimum: 0 }) totalPages!: number;
}
export class MediaPageResponseDto extends PageMetadataDto {
  @ApiProperty({ type: [MediaResponseDto] }) items!: MediaResponseDto[];
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

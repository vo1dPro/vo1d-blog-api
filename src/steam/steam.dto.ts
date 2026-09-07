import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../common/dto/pagination.dto.js';

export class SteamAccountPlaytimeDto {
  @ApiProperty() accountName!: string;
  @ApiProperty({ minimum: 0 }) playtimeMinutes!: number;
  @ApiProperty() stale!: boolean;
}

export class SteamAccountStatusDto {
  @ApiProperty() name!: string;
  @ApiProperty() steamId!: string;
  @ApiProperty() syncing!: boolean;
  @ApiProperty() libraryVisible!: boolean;
  @ApiProperty() gameCount!: number;
  @ApiProperty({ type: String, nullable: true }) lastSuccessAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) nextSyncAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastErrorCode!: string | null;
}

export class SteamGameDto {
  @ApiProperty() appId!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ minimum: 0, description: 'Exact Steam total, in minutes' })
  playtimeMinutes!: number;
  @ApiProperty({ type: Number, nullable: true }) playtimeTwoWeeksMinutes!: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) lastPlayedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) syncedAt!: string;
  @ApiProperty() stale!: boolean;
  @ApiProperty({ description: 'One or more configured accounts have no visible snapshot' })
  incomplete!: boolean;
  @ApiProperty({ type: [SteamAccountPlaytimeDto] }) accountBreakdown!: SteamAccountPlaytimeDto[];
  @ApiProperty({ format: 'uri' }) storeUrl!: string;
}
export class SteamLibraryPageDto extends PaginatedResponseDto<SteamGameDto> {
  @ApiProperty({ type: [SteamGameDto] }) declare items: SteamGameDto[];
}
export class SteamStatusDto {
  @ApiProperty({ type: [SteamAccountStatusDto] }) accounts!: SteamAccountStatusDto[];
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: String, nullable: true }) steamId!: string | null;
  @ApiProperty() intervalSeconds!: number;
  @ApiProperty() syncing!: boolean;
  @ApiProperty() libraryVisible!: boolean;
  @ApiProperty() gameCount!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) lastSuccessAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) nextSyncAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) lastErrorCode!: string | null;
}
export class SteamLinkResultDto {
  @ApiProperty({ type: [Number] }) linkedGameIds!: number[];
}

import { ApiProperty } from '@nestjs/swagger';
import { GameResponseDto } from './game-response.dto.js';

export class GamePresenceResponseDto {
  @ApiProperty({ enum: ['steam'] }) source!: 'steam';
  @ApiProperty({ enum: ['playing', 'idle', 'unavailable', 'unconfigured'] })
  state!: 'playing' | 'idle' | 'unavailable' | 'unconfigured';
  @ApiProperty({ type: GameResponseDto, nullable: true }) game!: GameResponseDto | null;
  @ApiProperty({ minimum: 0, description: 'Sum of effective hours of all visible games' })
  totalGameHours!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() refreshAfterMs!: number;
}

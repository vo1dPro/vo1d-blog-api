import { PartialType } from '@nestjs/swagger';
import { CreatePhotoDto } from './create-photo.dto.js';

export class UpdatePhotoDto extends PartialType(CreatePhotoDto, { skipNullProperties: false }) {}

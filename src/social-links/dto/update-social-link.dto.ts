import { PartialType } from '@nestjs/swagger';
import { CreateSocialLinkDto } from './create-social-link.dto.js';
export class UpdateSocialLinkDto extends PartialType(CreateSocialLinkDto, {
  skipNullProperties: false,
}) {}

import { PartialType } from '@nestjs/swagger';
import { CreateBookDto } from './create-book.dto.js';

export class UpdateBookDto extends PartialType(CreateBookDto, { skipNullProperties: false }) {}

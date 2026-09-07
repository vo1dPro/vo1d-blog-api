import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateCategoryDto } from '../../categories/dto/update-category.dto.js';
import { UpdateGameDto } from '../../games/dto/update-game.dto.js';
import { UpdatePhotoDto } from '../../photos/dto/update-photo.dto.js';
import { UpdateSkillDto } from '../../skills/dto/update-skill.dto.js';
import { UpdateSocialLinkDto } from '../../social-links/dto/update-social-link.dto.js';
import { UpdateTagDto } from '../../tags/dto/update-tag.dto.js';
import { CreateBookDto } from './create-book.dto.js';
import { UpdateBookDto } from './update-book.dto.js';

interface DtoCase {
  name: string;
  type: new () => object;
  required: string[];
  nullable: string[];
}

const cases: DtoCase[] = [
  {
    name: 'book',
    type: UpdateBookDto,
    required: [
      'title',
      'author',
      'coverMediaId',
      'accent',
      'readingOrder',
      'progress',
      'isVisible',
      'sortOrder',
    ],
    nullable: ['sourceName', 'sourceUrl', 'lastReadAt', 'startedAt', 'finishedAt'],
  },
  {
    name: 'game',
    type: UpdateGameDto,
    required: [
      'title',
      'coverMediaId',
      'rating',
      'playtimeHours',
      'likeLevel',
      'isVisible',
      'sortOrder',
    ],
    nullable: ['platform', 'comment'],
  },
  {
    name: 'photo',
    type: UpdatePhotoDto,
    required: [
      'originalMediaId',
      'thumbnailMediaId',
      'alt',
      'title',
      'description',
      'isVisible',
      'sortOrder',
    ],
    nullable: ['capturedAt'],
  },
  {
    name: 'category',
    type: UpdateCategoryDto,
    required: ['key', 'label', 'sortOrder', 'isVisible'],
    nullable: ['iconKey'],
  },
  { name: 'tag', type: UpdateTagDto, required: ['slug', 'name'], nullable: [] },
  {
    name: 'skill',
    type: UpdateSkillDto,
    required: ['name', 'iconKey', 'sortOrder', 'isVisible'],
    nullable: [],
  },
  {
    name: 'social link',
    type: UpdateSocialLinkDto,
    required: ['name', 'platform', 'url', 'iconKey', 'sortOrder', 'isVisible'],
    nullable: [],
  },
];

describe('content update DTO null semantics', () => {
  for (const dto of cases) {
    it(`${dto.name}: omitted fields remain optional`, async () => {
      expect(await validate(plainToInstance(dto.type, {}))).toHaveLength(0);
    });

    for (const field of dto.required) {
      it(`${dto.name}: explicitly rejects null ${field}`, async () => {
        const errors = await validate(plainToInstance(dto.type, { [field]: null }));
        expect(errors.some((error) => error.property === field)).toBe(true);
      });
    }

    for (const field of dto.nullable) {
      it(`${dto.name}: permits clearing ${field}`, async () => {
        expect(await validate(plainToInstance(dto.type, { [field]: null }))).toHaveLength(0);
      });
    }
  }

  it('accepts meaningful zero and false values without replacing them with defaults', async () => {
    expect(
      await validate(
        plainToInstance(UpdateGameDto, {
          rating: 0,
          playtimeHours: 0,
          likeLevel: 0,
          sortOrder: 0,
          isVisible: false,
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(UpdateBookDto, { progress: 0, isVisible: false })),
    ).toHaveLength(0);
  });

  it('rejects PostgreSQL integer overflow before reaching the database', async () => {
    const errors = await validate(plainToInstance(UpdateGameDto, { playtimeHours: 2_147_483_648 }));
    expect(errors.some((error) => error.property === 'playtimeHours')).toBe(true);
  });

  it('requires a timezone for editable date-times', async () => {
    expect(
      await validate(plainToInstance(UpdateBookDto, { lastReadAt: '2026-09-05T12:30:00' })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(UpdateBookDto, { lastReadAt: '2026-09-05T12:30:00+08:00' })),
    ).toHaveLength(0);
  });

  it('rejects null optional-but-nonnullable properties on create', async () => {
    const book = plainToInstance(CreateBookDto, {
      title: 'Test book',
      author: 'Test author',
      coverMediaId: 1,
      accent: '#123456',
      readingOrder: 1,
      progress: null,
      isVisible: null,
      sortOrder: null,
    });
    const errors = await validate(book);
    expect(errors.map((error) => error.property).sort()).toEqual([
      'isVisible',
      'progress',
      'sortOrder',
    ]);
  });
});

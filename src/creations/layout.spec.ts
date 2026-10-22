import { describe, it, expect, vi } from 'vitest';
import { layoutSchema } from './layout.js';
import { CreationsService } from './creations.service.js';
import type { PrismaService } from '../database/prisma.service.js';
const id = '12a9ecf8-6cef-4b42-a372-d06aafbb3531';
const draft = {
  revision: 0,
  categories: [{ id, name: '技术' }],
  entries: [{ id: 'x:1234567890123456', span: 2, height: null, categoryIds: [id] }],
};
describe('creation layout integrity', () => {
  it('accepts multiple categories and trims names', () => {
    const second = '22a9ecf8-6cef-4b42-a372-d06aafbb3531';
    const value = {
      ...draft,
      categories: [...draft.categories, { id: second, name: ' 生活 ' }],
      entries: [{ ...draft.entries[0], categoryIds: [id, second] }],
    };
    expect(layoutSchema.parse(value).categories[1]?.name).toBe('生活');
  });
  it('rejects missing categories, duplicate names, invalid dimensions and duplicate posts', () => {
    for (const invalid of [
      { ...draft, categories: [] },
      {
        ...draft,
        categories: [
          ...draft.categories,
          { id: '22a9ecf8-6cef-4b42-a372-d06aafbb3531', name: '技术' },
        ],
      },
      { ...draft, entries: [{ ...draft.entries[0], height: 1001 }] },
      { ...draft, entries: [...draft.entries, ...draft.entries] },
    ])
      expect(layoutSchema.safeParse(invalid).success).toBe(false);
  });
  it('uses revision matching and rejects concurrent saves', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      creationPost: {
        findMany: vi.fn().mockResolvedValue([{ platform: 'x', externalId: '1234567890123456' }]),
      },
      creationLayout: { updateMany },
    };
    const prisma = { $transaction: vi.fn((work: (db: typeof tx) => unknown) => work(tx)) };
    const service = new CreationsService(prisma as unknown as PrismaService);
    await expect(service.saveLayout(draft)).rejects.toThrow('另一窗口');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, revision: 0 } }),
    );
  });
  it('rejects entries for deleted or unknown posts before writing', async () => {
    const updateMany = vi.fn();
    const tx = {
      creationPost: { findMany: vi.fn().mockResolvedValue([]) },
      creationLayout: { updateMany },
    };
    const service = new CreationsService({
      $transaction: (work: (db: typeof tx) => unknown) => work(tx),
    } as unknown as PrismaService);
    await expect(service.saveLayout(draft)).rejects.toThrow('部分动态');
    expect(updateMany).not.toHaveBeenCalled();
  });
});

import { z } from 'zod';
export const layoutSchema = z
  .object({
    revision: z.number().int().min(0).max(2147483646),
    categories: z
      .array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(30) }))
      .max(100),
    entries: z
      .array(
        z.object({
          id: z.string().regex(/^(x|douyin|bilibili):[a-zA-Z0-9_-]{1,80}$/),
          span: z.number().int().min(1).max(3),
          height: z.number().int().min(180).max(1000).nullable(),
          categoryIds: z.array(z.string().uuid()).max(100),
        }),
      )
      .max(2000),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.categories.map((c) => c.id));
    if (
      ids.size !== value.categories.length ||
      new Set(value.categories.map((c) => c.name.toLowerCase())).size !== value.categories.length ||
      new Set(value.entries.map((e) => e.id)).size !== value.entries.length ||
      value.entries.some(
        (e) =>
          new Set(e.categoryIds).size !== e.categoryIds.length ||
          e.categoryIds.some((id) => !ids.has(id)),
      )
    )
      ctx.addIssue({ code: 'custom', message: '分类重复或分类关联无效' });
  });

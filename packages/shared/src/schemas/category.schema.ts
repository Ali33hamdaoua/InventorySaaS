import { z } from 'zod';
import { CategoryType } from '../enums';

export const createCategorySchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  categoryType: z.nativeEnum(CategoryType).default(CategoryType.FOOD),
  isActive: z.boolean().default(true),
});
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

export const setCategoryStatusSchema = z.object({
  isActive: z.boolean(),
});
export type SetCategoryStatusDto = z.infer<typeof setCategoryStatusSchema>;

import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(2).max(150),
  unit: z.string().min(1).max(20), // kg, L, unité, etc.
  categoryId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  defaultCost: z.coerce.number().nonnegative(),
  minStockLevel: z.coerce.number().nonnegative().default(0),
  isActive: z.boolean().default(true),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

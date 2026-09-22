import { z } from 'zod';

export const upsertInventoryLineSchema = z.object({
  productId: z.string().uuid(),
  openingQuantity: z.coerce.number().nonnegative().optional(),
  openingUnitCost: z.coerce.number().nonnegative().optional(),
  closingQuantity: z.coerce.number().nonnegative().optional(),
  closingUnitCost: z.coerce.number().nonnegative().optional(),
});
export type UpsertInventoryLineDto = z.infer<typeof upsertInventoryLineSchema>;

export const bulkInventoryLinesSchema = z.object({
  lines: z.array(upsertInventoryLineSchema).min(1),
});
export type BulkInventoryLinesDto = z.infer<typeof bulkInventoryLinesSchema>;

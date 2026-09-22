import { z } from 'zod';

export const purchaseItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
});
/** Input shape (client → server) for a single purchase line. */
export type PurchaseItemInputDto = z.infer<typeof purchaseItemSchema>;

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().min(1).max(80),
  purchaseDate: z.coerce.date(),
  note: z.string().max(500).optional().nullable(),
  items: z.array(purchaseItemSchema).min(1, "Au moins une ligne d'achat"),
  /** Manual entry — backend just sums HT + TPS + TVQ, no rate enforcement. */
  tpsAmount: z.coerce.number().nonnegative().default(0),
  tvqAmount: z.coerce.number().nonnegative().default(0),
});
export type CreatePurchaseDto = z.infer<typeof createPurchaseSchema>;

export const updatePurchaseSchema = createPurchaseSchema.partial();
export type UpdatePurchaseDto = z.infer<typeof updatePurchaseSchema>;

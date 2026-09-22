import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(2).max(150),
  contactName: z.string().max(150).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().default(true),
});
export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierDto = z.infer<typeof updateSupplierSchema>;

export const setSupplierStatusSchema = z.object({
  isActive: z.boolean(),
});
export type SetSupplierStatusDto = z.infer<typeof setSupplierStatusSchema>;

import { z } from 'zod';

export const createPeriodSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  openingDate: z.coerce.date().optional(),
});
export type CreatePeriodDto = z.infer<typeof createPeriodSchema>;

export const closePeriodSchema = z.object({
  salesRevenue: z.coerce.number().nonnegative().optional().nullable(),
  closingDate: z.coerce.date().optional(),
});
export type ClosePeriodDto = z.infer<typeof closePeriodSchema>;

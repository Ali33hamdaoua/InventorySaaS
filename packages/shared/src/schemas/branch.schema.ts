import { z } from 'zod';

export const createBranchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug doit être en minuscules a-z, 0-9 ou -'),
  address: z.string().trim().max(255).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

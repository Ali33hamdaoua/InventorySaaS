import { z } from 'zod';
import { UserRole } from '../enums';

const roleEnum = z.enum(
  Object.values(UserRole) as [UserRole, ...UserRole[]],
);

/**
 * Create a new user. Branch rules:
 *  - MANAGER → branchId required (will reject if absent)
 *  - OWNER / ADMIN → branchId optional (null = access to all branches)
 */
export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nom requis (min 2 caractères)').max(120),
    email: z.string().trim().email().max(190),
    password: z.string().min(8, 'Mot de passe requis (min 8 caractères)').max(120),
    role: roleEnum,
    branchId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'MANAGER' && !v.branchId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branchId'],
        message: 'Un MANAGER doit être assigné à une succursale',
      });
    }
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Update an existing user. Password is intentionally NOT updatable here
 * (separate endpoint reserved for /users/:id/password).
 */
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(190).optional(),
    role: roleEnum.optional(),
    branchId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'MANAGER' && v.branchId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branchId'],
        message: 'Un MANAGER doit être assigné à une succursale',
      });
    }
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setUserStatusSchema = z.object({
  isActive: z.boolean(),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

export const listUsersSchema = z.object({
  search: z.string().trim().optional(),
  role: roleEnum.optional(),
  branchId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
export type ListUsersInput = z.infer<typeof listUsersSchema>;

import { z } from 'zod';
import { UserRole } from '../enums';

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe minimum 8 caractères'),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole).default(UserRole.MANAGER),
});
export type RegisterDto = z.infer<typeof registerSchema>;

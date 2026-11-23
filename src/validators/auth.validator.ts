import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .email('Must be a valid email address'),
  password: z
    .string({ required_error: 'password is required' })
    .min(1, 'password must not be empty'),
});

export type LoginSchema = z.infer<typeof loginSchema>;

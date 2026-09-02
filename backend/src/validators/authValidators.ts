import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上で入力してください')
  .max(72, 'パスワードは72文字以内で入力してください')
  .regex(/[A-Za-z]/, 'パスワードには英字を含めてください')
  .regex(/[0-9]/, 'パスワードには数字を含めてください');

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('メールアドレスの形式が不正です'),
    password: passwordSchema,
    name: z.string().min(1, '氏名を入力してください').max(50),
    phone: z.string().max(20).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1, 'パスワードを入力してください'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    newPassword: passwordSchema,
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(50).optional(),
    phone: z.string().max(20).optional(),
    avatarUrl: z.string().url().optional().or(z.literal('')),
  }),
});

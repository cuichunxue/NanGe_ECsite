import { z } from 'zod';

export const addCartItemSchema = z.object({
  body: z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999),
  }),
});

export const updateCartItemSchema = z.object({
  body: z.object({ quantity: z.number().int().min(1).max(999) }),
  params: z.object({ productId: z.string().uuid() }),
});

export const removeCartItemSchema = z.object({
  params: z.object({ productId: z.string().uuid() }),
});

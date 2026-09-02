import { z } from 'zod';

export const createReviewSchema = z.object({
  body: z.object({
    productId: z.string().uuid(),
    orderId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    content: z.string().min(1).max(1000),
    images: z.array(z.string().url()).default([]),
  }),
});

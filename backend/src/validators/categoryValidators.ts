import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(50),
    sortOrder: z.number().int().optional(),
    imageUrl: z.string().url().optional().or(z.literal('')),
  }),
});

export const updateCategorySchema = z.object({
  body: createCategorySchema.shape.body.partial(),
  params: z.object({ id: z.string().uuid() }),
});

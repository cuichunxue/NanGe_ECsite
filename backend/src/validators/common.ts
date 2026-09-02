import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParam = z.object({
  id: z.string().uuid('不正なID形式です'),
});

export const idParamSchema = z.object({ params: idParam });

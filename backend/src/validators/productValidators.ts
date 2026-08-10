import { z } from 'zod';

export const listProductsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    categoryId: z.string().uuid().optional(),
    keyword: z.string().max(100).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    sort: z.enum(['newest', 'priceAsc', 'priceDesc', 'sales', 'rating']).default('newest'),
    inStockOnly: z.coerce.boolean().optional(),
    status: z.enum(['ON_SALE', 'OFF_SHELF']).optional(),
  }),
});

const productBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1),
  sku: z.string().min(1).max(64),
  brand: z.string().max(100).optional(),
  categoryId: z.string().uuid(),
  price: z.number().positive(),
  originalPrice: z.number().positive().optional(),
  stock: z.number().int().min(0),
  images: z.array(z.string().url()).default([]),
  status: z.enum(['ON_SALE', 'OFF_SHELF']).optional(),
});

export const createProductSchema = z.object({ body: productBody });
export const updateProductSchema = z.object({
  body: productBody.partial(),
  params: z.object({ id: z.string().uuid() }),
});

export const adjustStockSchema = z.object({
  body: z.object({ delta: z.number().int() }),
  params: z.object({ id: z.string().uuid() }),
});

export const byIdsQuerySchema = z.object({
  query: z.object({
    ids: z
      .string()
      .optional()
      .default('')
      .transform((s) => s.split(',').filter(Boolean))
      .pipe(z.array(z.string().uuid()).max(20)),
  }),
});

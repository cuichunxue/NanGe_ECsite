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

/**
 * 円には補助単位が無いため、価格は必ず整数で扱う。小数を許すと、消費税の
 * 割り戻し（税率ごとに書類1枚につき1回の端数処理）や合計額に端数が残り、
 * 領収書の金額が合わなくなる。
 *
 * 上限を置いているのは、桁の大きすぎる値がデータベースの数値の範囲を超えて
 * サーバー側の異常（500）になっていたため。入力の誤りは400で返す。
 */
const yenAmount = z
  .number({ invalid_type_error: '金額は数値で入力してください' })
  .int('金額は1円単位（整数）で入力してください')
  .positive('金額は1円以上で入力してください')
  .max(10_000_000, '金額は1,000万円以下で入力してください');

const productBody = z.object({
  name: z.string().trim().min(1, '商品名を入力してください').max(200, '商品名は200文字以内で入力してください'),
  description: z.string().trim().min(1, '商品説明を入力してください').max(5000, '商品説明は5000文字以内で入力してください'),
  sku: z.string().trim().min(1, '商品コード(SKU)を入力してください').max(64, '商品コード(SKU)は64文字以内で入力してください'),
  brand: z.string().max(100).optional(),
  categoryId: z.string().uuid(),
  price: yenAmount,
  originalPrice: yenAmount.optional(),
  stock: z.number().int('在庫数は整数で入力してください').min(0, '在庫数は0以上で入力してください').max(1_000_000, '在庫数は100万以下で入力してください'),
  images: z.array(z.string().url()).default([]),
  // 飲食料品（酒類・外食を除く）は軽減税率8%、それ以外は10%
  taxRate: z.union([z.literal(10), z.literal(8)]).default(10),
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

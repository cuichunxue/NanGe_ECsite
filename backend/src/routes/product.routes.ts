import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { validate } from '../middleware/validate';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { ok, okPaginated } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { idParamSchema } from '../validators/common';
import {
  adjustStockSchema,
  byIdsQuerySchema,
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from '../validators/productValidators';

const router = Router();

const sortMap: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  priceAsc: { price: 'asc' },
  priceDesc: { price: 'desc' },
  sales: { salesCount: 'desc' },
  rating: { ratingAvg: 'desc' },
};

router.get(
  '/',
  optionalAuth,
  validate(listProductsQuerySchema),
  catchAsync(async (req, res) => {
    const { page, pageSize, categoryId, keyword, minPrice, maxPrice, sort, inStockOnly, status } = req.query as unknown as {
      page: number;
      pageSize: number;
      categoryId?: string;
      keyword?: string;
      minPrice?: number;
      maxPrice?: number;
      sort: string;
      inStockOnly?: boolean;
      status?: 'ON_SALE' | 'OFF_SHELF';
    };

    const isAdmin = req.user?.role === 'ADMIN';
    const where: Prisma.ProductWhereInput = {
      ...(status ? { status } : isAdmin ? {} : { status: 'ON_SALE' }),
      ...(categoryId ? { categoryId } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { description: { contains: keyword, mode: 'insensitive' } },
              { brand: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? { price: { ...(minPrice !== undefined ? { gte: minPrice } : {}), ...(maxPrice !== undefined ? { lte: maxPrice } : {}) } }
        : {}),
      ...(inStockOnly ? { stock: { gt: 0 } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: sortMap[sort],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: { select: { id: true, name: true } } },
      }),
      prisma.product.count({ where }),
    ]);

    okPaginated(res, items, { page, pageSize, total });
  }),
);

// 「最近チェックした商品」など、クライアント側で保持したID群から現在の価格/在庫を再取得するための一括取得API。
// :id ルートより前に登録し、"by-ids" が商品IDとして解釈されないようにする。
router.get(
  '/by-ids',
  validate(byIdsQuerySchema),
  catchAsync(async (req, res) => {
    const { ids } = req.query as unknown as { ids: string[] };
    if (ids.length === 0) return ok(res, []);
    const products = await prisma.product.findMany({
      where: { id: { in: ids }, status: 'ON_SALE' },
    });
    // 要求されたID順を維持して返す（表示順=閲覧履歴の新しい順を保つため）
    const byId = new Map(products.map((p) => [p.id, p]));
    ok(
      res,
      ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p)),
    );
  }),
);

router.get(
  '/:id',
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!product) throw ApiError.notFound('商品が見つかりません');
    ok(res, product);
  }),
);

router.get(
  '/:id/reviews',
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const reviews = await prisma.review.findMany({
      where: { productId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    ok(res, reviews);
  }),
);

router.get(
  '/:id/related',
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw ApiError.notFound('商品が見つかりません');
    const related = await prisma.product.findMany({
      where: { categoryId: product.categoryId, id: { not: product.id }, status: 'ON_SALE' },
      take: 8,
      orderBy: { salesCount: 'desc' },
    });
    ok(res, related);
  }),
);

// --- 管理者用 ---
router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate(createProductSchema),
  catchAsync(async (req, res) => {
    const product = await prisma.product.create({ data: req.body });
    ok(res, product, 201);
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(updateProductSchema),
  catchAsync(async (req, res) => {
    const product = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
    ok(res, product);
  }),
);

router.post(
  '/:id/stock-adjust',
  requireAuth,
  requireAdmin,
  validate(adjustStockSchema),
  catchAsync(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw ApiError.notFound('商品が見つかりません');
    const newStock = product.stock + req.body.delta;
    if (newStock < 0) throw ApiError.badRequest('在庫数がマイナスになります', 'INVALID_STOCK');
    const updated = await prisma.product.update({ where: { id: req.params.id }, data: { stock: newStock } });
    ok(res, updated);
  }),
);

router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    await prisma.product.update({ where: { id: req.params.id }, data: { status: 'OFF_SHELF' } });
    ok(res, { message: '非公開にしました' });
  }),
);

export default router;

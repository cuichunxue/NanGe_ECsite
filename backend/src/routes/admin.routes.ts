import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { catchAsync } from '../utils/catchAsync';
import { ok, okPaginated } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { idParamSchema, paginationQuery } from '../validators/common';
import { updateOrderStatusSchema, listOrdersQuerySchema } from '../validators/orderValidators';
import * as orderService from '../services/order.service';
import { toPublicUser } from '../services/auth.service';
import { MAX_IMAGE_BYTES, storeProductImage } from '../services/upload.service';
import { FREE_SHIPPING_THRESHOLD } from '../config/shipping';

const router = Router();
router.use(requireAuth, requireAdmin);

// --- ダッシュボード ---
router.get(
  '/dashboard',
  catchAsync(async (_req, res) => {
    const [userCount, orderCount, productCount, lowStockCount, revenueAgg, statusGroups] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.order.count(),
      prisma.product.count({ where: { status: 'ON_SALE' } }),
      prisma.product.count({ where: { stock: { lte: 10 }, status: 'ON_SALE' } }),
      prisma.order.aggregate({
        where: { status: { in: ['PAID', 'SHIPPED', 'COMPLETED'] } },
        _sum: { totalAmount: true },
      }),
      prisma.order.groupBy({ by: ['status'], _count: { status: true } }),
    ]);

    // 販売中の商品がすべて送料無料の基準額以上だと、何を1点買っても送料無料になり、
    // 送料は全額が店主の負担になる。金額そのものは正常に処理されるため気づきにくく、
    // 気づかないまま続けると利益がじわじわ削られる。ここで知らせる。
    const cheapest = await prisma.product.findFirst({
      where: { status: 'ON_SALE' },
      orderBy: { price: 'asc' },
      select: { price: true },
    });
    const alwaysFreeShipping = Boolean(cheapest && Number(cheapest.price) >= FREE_SHIPPING_THRESHOLD);

    // 入金済みで発送していない注文。特定商取引法に基づく表示で約束した発送期限を
    // 守れているかは、注文一覧を毎日見に行かないと分からない。ダッシュボードで
    // 件数といちばん古いものを知らせる。
    const [awaitingShipmentCount, oldestAwaiting] = await Promise.all([
      prisma.order.count({ where: { status: 'PAID' } }),
      prisma.order.findFirst({
        where: { status: 'PAID' },
        orderBy: { paidAt: 'asc' },
        select: { orderNo: true, paidAt: true },
      }),
    ]);

    const recentOrders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true, email: true } } },
    });

    ok(res, {
      userCount,
      orderCount,
      productCount,
      lowStockCount,
      totalRevenue: revenueAgg._sum.totalAmount ?? 0,
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
      // 「どの商品を買っても送料無料になる」状態かどうか
      alwaysFreeShipping,
      cheapestProductPrice: cheapest ? Number(cheapest.price) : null,
      awaitingShipment: {
        count: awaitingShipmentCount,
        oldestOrderNo: oldestAwaiting?.orderNo ?? null,
        oldestPaidAt: oldestAwaiting?.paidAt ?? null,
      },
      ordersByStatus: statusGroups.map((g) => ({ status: g.status, count: g._count.status })),
      recentOrders,
    });
  }),
);

// --- 会員管理 ---
router.get(
  '/users',
  validate(z.object({ query: paginationQuery.extend({ keyword: z.string().optional() }) })),
  catchAsync(async (req, res) => {
    const { page, pageSize, keyword } = req.query as unknown as { page: number; pageSize: number; keyword?: string };
    const where = keyword
      ? { OR: [{ email: { contains: keyword, mode: 'insensitive' as const } }, { name: { contains: keyword, mode: 'insensitive' as const } }] }
      : {};
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.user.count({ where }),
    ]);
    okPaginated(res, items.map(toPublicUser), { page, pageSize, total });
  }),
);

router.patch(
  '/users/:id/status',
  validate(z.object({ params: idParamSchema.shape.params, body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }) })),
  catchAsync(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw ApiError.notFound('会員が見つかりません');
    // 管理画面から新たな管理者を作成する手段が無いため、店主(ADMIN)を凍結すると
    // 誰もログインできなくなり、データベースを直接操作しない限り復旧できない。
    // 一覧画面ではADMIN行にボタンを出していないが、API単体でも必ず拒む。
    if (target.role === 'ADMIN') {
      throw ApiError.badRequest('店主のアカウントを凍結することはできません', 'CANNOT_SUSPEND_ADMIN');
    }
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { status: req.body.status } });
    if (req.body.status === 'SUSPENDED') {
      // 凍結を即座に有効化するため、既存のリフレッシュトークンを全て失効させる
      // （既発行のアクセストークンは短命のため、最長でもその有効期限内に失効する）
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    }
    ok(res, toPublicUser(user));
  }),
);

// --- 注文管理 ---
router.get(
  '/orders',
  validate(listOrdersQuerySchema),
  catchAsync(async (req, res) => {
    const { page, pageSize, status } = req.query as unknown as { page: number; pageSize: number; status?: string };
    const where = status ? { status: status as never } : {};
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: true, user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.order.count({ where }),
    ]);
    okPaginated(res, items, { page, pageSize, total });
  }),
);

router.get(
  '/orders/:id',
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, user: { select: { id: true, name: true, email: true } } },
    });
    if (!order) throw ApiError.notFound('注文が見つかりません');
    ok(res, order);
  }),
);

router.patch(
  '/orders/:id/status',
  validate(updateOrderStatusSchema),
  catchAsync(async (req, res) => {
    const order = await orderService.adminUpdateStatus(req.params.id, req.body.status, {
      carrier: req.body.carrier,
      trackingNumber: req.body.trackingNumber,
    });
    ok(res, order);
  }),
);

// --- 商品画像のアップロード ---
// メモリ上で受け取り、画像と確認できたものだけを保存する。
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

router.post(
  '/uploads',
  imageUpload.single('file'),
  catchAsync(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('画像が選択されていません', 'NO_FILE');
    const stored = await storeProductImage(req.file);
    ok(res, stored, 201);
  }),
);

export default router;

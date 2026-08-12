import { Router } from 'express';
import { prisma } from '../config/prisma';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { orderRateLimiter } from '../middleware/rateLimiter';
import { catchAsync } from '../utils/catchAsync';
import { ok, okPaginated } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { idParamSchema } from '../validators/common';
import { checkoutSchema, listOrdersQuerySchema } from '../validators/orderValidators';
import * as orderService from '../services/order.service';
import { calculateTaxBreakdown, shippingTaxLine } from '../config/tax';
import { env } from '../config/env';

const router = Router();
router.use(requireAuth);

router.post(
  '/',
  orderRateLimiter,
  validate(checkoutSchema),
  catchAsync(async (req, res) => {
    const order = await orderService.checkout({ userId: req.user!.id, ...req.body });
    ok(res, order, 201);
  }),
);

router.get(
  '/',
  validate(listOrdersQuerySchema),
  catchAsync(async (req, res) => {
    const { page, pageSize, status } = req.query as unknown as { page: number; pageSize: number; status?: string };
    const where = { userId: req.user!.id, ...(status ? { status: status as never } : {}) };
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: true },
      }),
      prisma.order.count({ where }),
    ]);
    okPaginated(res, items, { page, pageSize, total });
  }),
);

router.get(
  '/:id',
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order || order.userId !== req.user!.id) throw ApiError.notFound('注文が見つかりません');
    ok(res, order);
  }),
);

/**
 * 請求書・領収書の内容を返す。
 * 登録番号が設定されているときだけ「適格請求書」として扱う
 * （免税事業者は適格請求書を発行できないため）。
 */
router.get(
  '/:id/invoice',
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order || order.userId !== req.user!.id) throw ApiError.notFound('注文が見つかりません');
    if (order.status === 'PENDING_PAYMENT' || order.status === 'CANCELLED') {
      throw ApiError.conflict('お支払いが完了した注文のみ発行できます', 'INVOICE_NOT_AVAILABLE');
    }

    const lines = [
      ...order.items.map((i) => ({ taxIncludedAmount: Number(i.price) * i.quantity, taxRate: i.taxRate })),
      ...shippingTaxLine(Number(order.shippingFee)),
    ];

    ok(res, {
      order,
      issuer: {
        name: env.invoice.issuerName,
        registrationNumber: env.invoice.registrationNumber,
      },
      // 登録番号があれば適格請求書、なければ領収書として発行する
      qualified: Boolean(env.invoice.registrationNumber),
      taxBreakdown: calculateTaxBreakdown(lines),
    });
  }),
);

// 決済ページのURLを発行する。支払い済みにするのはKOMOJUからのWebhookのみ。
router.post(
  '/:id/payment-session',
  orderRateLimiter,
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const result = await orderService.createPaymentSession(req.user!.id, req.params.id);
    ok(res, result);
  }),
);

router.post(
  '/:id/cancel',
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const order = await orderService.cancelOrder(req.user!.id, req.params.id);
    ok(res, order);
  }),
);

router.post(
  '/:id/confirm-receipt',
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const order = await orderService.confirmReceipt(req.user!.id, req.params.id);
    ok(res, order);
  }),
);

export default router;

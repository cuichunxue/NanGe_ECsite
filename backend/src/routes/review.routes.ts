import { Router } from 'express';
import { prisma } from '../config/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { catchAsync } from '../utils/catchAsync';
import { ok } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { idParamSchema } from '../validators/common';
import { createReviewSchema } from '../validators/reviewValidators';
import * as reviewService from '../services/review.service';

const router = Router();

router.post(
  '/',
  requireAuth,
  validate(createReviewSchema),
  catchAsync(async (req, res) => {
    const review = await reviewService.createReview(req.user!.id, req.body);
    ok(res, review, 201);
  }),
);

router.get(
  '/mine',
  requireAuth,
  catchAsync(async (req, res) => {
    const reviews = await prisma.review.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { id: true, name: true, images: true } } },
    });
    ok(res, reviews);
  }),
);

router.delete(
  '/:id',
  requireAuth,
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw ApiError.notFound('レビューが見つかりません');
    if (review.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw ApiError.forbidden();
    }
    await reviewService.deleteReview(req.params.id);
    ok(res, { message: '削除しました' });
  }),
);

// 管理者: 全レビュー閲覧
router.get(
  '/',
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    const reviews = await prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      take: 200,
    });
    ok(res, reviews);
  }),
);

export default router;

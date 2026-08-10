import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { catchAsync } from '../utils/catchAsync';
import { ok } from '../utils/apiResponse';

const router = Router();
router.use(requireAuth);

const addSchema = z.object({ body: z.object({ productId: z.string().uuid() }) });
const removeSchema = z.object({ params: z.object({ productId: z.string().uuid() }) });

router.get(
  '/',
  catchAsync(async (req, res) => {
    const items = await prisma.wishlist.findMany({
      where: { userId: req.user!.id },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, items);
  }),
);

router.post(
  '/',
  validate(addSchema),
  catchAsync(async (req, res) => {
    const item = await prisma.wishlist.upsert({
      where: { userId_productId: { userId: req.user!.id, productId: req.body.productId } },
      update: {},
      create: { userId: req.user!.id, productId: req.body.productId },
    });
    ok(res, item, 201);
  }),
);

router.delete(
  '/:productId',
  validate(removeSchema),
  catchAsync(async (req, res) => {
    await prisma.wishlist.deleteMany({ where: { userId: req.user!.id, productId: req.params.productId } });
    ok(res, { message: '削除しました' });
  }),
);

export default router;

import { Router } from 'express';
import { prisma } from '../config/prisma';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { catchAsync } from '../utils/catchAsync';
import { ok } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { idParamSchema } from '../validators/common';
import { createAddressSchema, updateAddressSchema } from '../validators/addressValidators';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  catchAsync(async (req, res) => {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    ok(res, addresses);
  }),
);

router.post(
  '/',
  validate(createAddressSchema),
  catchAsync(async (req, res) => {
    const userId = req.user!.id;
    if (req.body.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const existingCount = await prisma.address.count({ where: { userId } });
    const address = await prisma.address.create({
      data: { ...req.body, userId, isDefault: req.body.isDefault ?? existingCount === 0 },
    });
    ok(res, address, 201);
  }),
);

router.patch(
  '/:id',
  validate(updateAddressSchema),
  catchAsync(async (req, res) => {
    const userId = req.user!.id;
    const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== userId) throw ApiError.notFound('住所が見つかりません');
    if (req.body.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const address = await prisma.address.update({ where: { id: req.params.id }, data: req.body });
    ok(res, address);
  }),
);

router.delete(
  '/:id',
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const existing = await prisma.address.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user!.id) throw ApiError.notFound('住所が見つかりません');
    await prisma.address.delete({ where: { id: req.params.id } });
    ok(res, { message: '削除しました' });
  }),
);

export default router;

import { Router } from 'express';
import { prisma } from '../config/prisma';
import { validate } from '../middleware/validate';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { ok } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { idParamSchema } from '../validators/common';
import { createCategorySchema, updateCategorySchema } from '../validators/categoryValidators';

const router = Router();

// 一覧（フラットな並び順） - 公開。更新頻度が低いため短時間キャッシュしAPI/DB負荷を下げる
router.get(
  '/',
  catchAsync(async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    ok(res, categories);
  }),
);

router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate(createCategorySchema),
  catchAsync(async (req, res) => {
    const category = await prisma.category.create({ data: req.body });
    ok(res, category, 201);
  }),
);

router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(updateCategorySchema),
  catchAsync(async (req, res) => {
    const category = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
    ok(res, category);
  }),
);

router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(idParamSchema),
  catchAsync(async (req, res) => {
    const productCount = await prisma.product.count({ where: { categoryId: req.params.id } });
    if (productCount > 0) {
      throw ApiError.conflict('商品が紐づいているカテゴリは削除できません', 'CATEGORY_IN_USE');
    }
    await prisma.category.delete({ where: { id: req.params.id } });
    ok(res, { message: '削除しました' });
  }),
);

export default router;

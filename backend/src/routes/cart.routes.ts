import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { catchAsync } from '../utils/catchAsync';
import { ok } from '../utils/apiResponse';
import * as cartService from '../services/cart.service';
import { addCartItemSchema, removeCartItemSchema, updateCartItemSchema } from '../validators/cartValidators';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  catchAsync(async (req, res) => {
    const cart = await cartService.getOrCreateCart(req.user!.id);
    ok(res, cartService.summarizeCart(cart));
  }),
);

router.post(
  '/items',
  validate(addCartItemSchema),
  catchAsync(async (req, res) => {
    const result = await cartService.addItem(req.user!.id, req.body.productId, req.body.quantity);
    ok(res, result, 201);
  }),
);

router.patch(
  '/items/:productId',
  validate(updateCartItemSchema),
  catchAsync(async (req, res) => {
    const result = await cartService.updateItem(req.user!.id, req.params.productId, req.body.quantity);
    ok(res, result);
  }),
);

router.delete(
  '/items/:productId',
  validate(removeCartItemSchema),
  catchAsync(async (req, res) => {
    const result = await cartService.removeItem(req.user!.id, req.params.productId);
    ok(res, result);
  }),
);

export default router;

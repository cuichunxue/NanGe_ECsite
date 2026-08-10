import { Router } from 'express';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authRateLimiter, loginRateLimiter, refreshRateLimiter } from '../middleware/rateLimiter';
import { catchAsync } from '../utils/catchAsync';
import { ok } from '../utils/apiResponse';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/authValidators';
import * as authService from '../services/auth.service';

const router = Router();

router.post(
  '/register',
  authRateLimiter,
  validate(registerSchema),
  catchAsync(async (req, res) => {
    const result = await authService.register(req.body);
    ok(res, result, 201);
  }),
);

router.post(
  '/login',
  loginRateLimiter,
  validate(loginSchema),
  catchAsync(async (req, res) => {
    const result = await authService.login(req.body);
    ok(res, result);
  }),
);

router.post(
  '/refresh',
  refreshRateLimiter,
  validate(refreshSchema),
  catchAsync(async (req, res) => {
    const result = await authService.refresh(req.body.refreshToken);
    ok(res, result);
  }),
);

router.post(
  '/logout',
  validate(refreshSchema),
  catchAsync(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    ok(res, { message: 'ログアウトしました' });
  }),
);

router.post(
  '/forgot-password',
  authRateLimiter,
  validate(forgotPasswordSchema),
  catchAsync(async (req, res) => {
    const result = await authService.requestPasswordReset(req.body.email);
    ok(res, {
      message: 'ご登録のメールアドレス宛にパスワード再設定用のリンクを送信しました（登録がない場合も同じ表示となります）',
      // メール送信基盤が未接続のため、開発環境に限りトークンをレスポンスで返し動作確認できるようにする
      ...(env.isProd ? {} : { devToken: result?.token, devExpiresAt: result?.expiresAt }),
    });
  }),
);

router.post(
  '/reset-password',
  authRateLimiter,
  validate(resetPasswordSchema),
  catchAsync(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.newPassword);
    ok(res, { message: 'パスワードを再設定しました。新しいパスワードでログインしてください。' });
  }),
);

router.get(
  '/me',
  requireAuth,
  catchAsync(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    ok(res, authService.toPublicUser(user));
  }),
);

router.patch(
  '/me',
  requireAuth,
  validate(updateProfileSchema),
  catchAsync(async (req, res) => {
    const user = await prisma.user.update({ where: { id: req.user!.id }, data: req.body });
    ok(res, authService.toPublicUser(user));
  }),
);

router.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  catchAsync(async (req, res) => {
    await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    ok(res, { message: 'パスワードを変更しました' });
  }),
);

export default router;

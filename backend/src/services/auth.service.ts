import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';
import { comparePassword, hashPassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { env } from '../config/env';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30分

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function msFromExpiry(expiry: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiry);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000;
  return value * multiplier;
}

export function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

async function issueTokens(userId: string, role: 'USER' | 'ADMIN', email: string) {
  const accessToken = signAccessToken({ sub: userId, role, email });
  const refreshToken = signRefreshToken(userId);
  const expiresAt = new Date(Date.now() + msFromExpiry(env.jwtRefreshExpiresIn));
  await prisma.refreshToken.create({ data: { token: refreshToken, userId, expiresAt } });
  return { accessToken, refreshToken };
}

export async function register(input: { email: string; password: string; name: string; phone?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.conflict('このメールアドレスは既に登録されています', 'EMAIL_TAKEN');
  }
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone,
      cart: { create: {} },
    },
  });
  const tokens = await issueTokens(user.id, user.role, user.email);
  return { user: toPublicUser(user), ...tokens };
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw ApiError.unauthorized('メールアドレスまたはパスワードが正しくありません', 'INVALID_CREDENTIALS');
  }
  if (user.status === 'SUSPENDED') {
    throw ApiError.forbidden('このアカウントは停止されています', 'ACCOUNT_SUSPENDED');
  }
  const valid = await comparePassword(input.password, user.passwordHash);
  if (!valid) {
    throw ApiError.unauthorized('メールアドレスまたはパスワードが正しくありません', 'INVALID_CREDENTIALS');
  }
  const tokens = await issueTokens(user.id, user.role, user.email);
  return { user: toPublicUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('リフレッシュトークンが無効です', 'INVALID_REFRESH_TOKEN');
  }
  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.userId !== payload.sub || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('リフレッシュトークンが無効または期限切れです', 'INVALID_REFRESH_TOKEN');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw ApiError.unauthorized();
  }
  if (user.status === 'SUSPENDED') {
    // 停止済みアカウントが延々とトークンを更新し続けられないよう、リフレッシュを拒否したうえで
    // 残っているセッションも道連れで無効化する（凍結操作の実効性を担保する）。
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    throw ApiError.forbidden('このアカウントは停止されています', 'ACCOUNT_SUSPENDED');
  }
  await prisma.refreshToken.delete({ where: { token: refreshToken } });
  const tokens = await issueTokens(user.id, user.role, user.email);
  return { user: toPublicUser(user), ...tokens };
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw ApiError.badRequest('現在のパスワードが正しくありません', 'INVALID_CURRENT_PASSWORD');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

/**
 * パスワード再設定用トークンを発行する。メールアドレスの存在有無を外部に漏らさないため、
 * 未登録アドレスでも常に成功扱いのレスポンスとする（呼び出し元でメッセージを統一すること）。
 * 実運用では resetUrl をメール送信サービスで届ける。メール未連携の間は、開発環境でのみ
 * レスポンスにトークンを含めて動作確認できるようにしている。
 */
export async function requestPasswordReset(email: string): Promise<{ token: string; expiresAt: Date } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
  ]);

  console.log(`[password-reset] ${email} 宛のリセットトークンを発行しました（本来はメール送信）: ${token}`);
  return { token, expiresAt };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest('リセットリンクが無効または期限切れです', 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
  ]);
}

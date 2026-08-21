import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';
import { verifyAccessToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'USER' | 'ADMIN';
        email: string;
      };
    }
  }
}

/**
 * アクセストークンだけでなく、アカウントが今も有効かを毎回確かめる。
 *
 * トークンは発行後15分間有効なため、署名の検証だけで通してしまうと、店主が
 * 会員を凍結してもその15分間は操作を続けられる。実際に試したところ、凍結した
 * 会員が一点物の在庫を次々と注文で押さえ、支払い保留の期限（既定60分）まで
 * 他のお客が買えない状態を作れてしまった。凍結は「今すぐ止める」ための操作
 * なので、待ち時間があってはならない。
 *
 * 主キーでの1件取得を認証のたびに行うことになるが、個人が運営する規模では
 * 問題にならない。役割(role)もここで読み直すため、権限の変更も即座に効く。
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('ログインが必要です'));
  }
  const token = header.slice('Bearer '.length);
  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(ApiError.unauthorized('トークンが無効または期限切れです'));
  }

  try {
    const account = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, email: true, status: true },
    });
    if (!account) {
      // 退会などでアカウントが無くなっている
      return next(ApiError.unauthorized('アカウントが見つかりません'));
    }
    if (account.status !== 'ACTIVE') {
      return next(ApiError.forbidden('このアカウントは停止されています', 'ACCOUNT_SUSPENDED'));
    }
    req.user = { id: account.id, role: account.role, email: account.email };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * ログインしていれば個別の情報を添える、していなくても表示できる画面向け。
 * 凍結されたアカウントは「ログインしていない人」と同じ扱いにする。
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    const account = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, email: true, status: true },
    });
    if (account && account.status === 'ACTIVE') {
      req.user = { id: account.id, role: account.role, email: account.email };
    }
  } catch {
    // トークン無効時・照会に失敗した場合は未認証として扱う（画面は表示できる）
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(ApiError.unauthorized());
  }
  if (req.user.role !== 'ADMIN') {
    return next(ApiError.forbidden('管理者権限が必要です'));
  }
  next();
}

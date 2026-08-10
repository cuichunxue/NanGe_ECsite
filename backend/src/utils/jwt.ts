import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: 'USER' | 'ADMIN';
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpiresIn as jwt.SignOptions['expiresIn'] });
}

/**
 * リフレッシュトークンを発行する。
 * JWTの iat / exp は秒単位のため、同じ利用者が同じ秒内に2回発行すると（ログインボタンの
 * 二度押し、複数タブ・複数端末からの同時ログイン）、ペイロードが完全に一致して
 * 同一の文字列が生成される。保存先の RefreshToken.token は一意制約付きなので、
 * そのままでは2回目の発行が衝突してログイン自体が失敗してしまう。
 * 発行ごとにランダムな jti を含めて、常に異なるトークンになるようにする。
 */
export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, jti: crypto.randomUUID() }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { sub: string };
}

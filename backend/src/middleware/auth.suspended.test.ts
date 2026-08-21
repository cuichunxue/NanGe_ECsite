import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';

/**
 * 凍結された会員が、手元に残っているアクセストークンで操作を続けられないことを確かめる。
 *
 * アクセストークンは発行から15分間有効なため、署名の検証だけで通してしまうと、
 * 店主が凍結してもその間は操作できてしまう。実際に試したところ、凍結した会員が
 * 一点物を次々に注文して在庫を押さえ、支払い保留の期限（既定60分）まで他のお客が
 * 買えない状態を作れた。凍結は「今すぐ止める」ための操作なので、待ち時間があっては
 * ならない。役割(role)もトークンではなくデータベースの値を使う。
 */

const userFindUnique = vi.fn();

vi.mock('../config/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    order: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    product: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  },
}));

const USER_ID = '30000000-0000-4000-8000-000000000003';

async function callWithToken(role: 'USER' | 'ADMIN' = 'USER') {
  const { createApp } = await import('../app');
  const { signAccessToken } = await import('../utils/jwt');
  const token = signAccessToken({ sub: USER_ID, role, email: 'kokyaku@example.com' });
  return request(createApp()).get('/api/orders').set('Authorization', `Bearer ${token}`);
}

describe('凍結された会員の締め出し', () => {
  beforeEach(() => vi.clearAllMocks());

  it('凍結された会員は、有効なトークンを持っていても操作できない', async () => {
    userFindUnique.mockResolvedValue({ id: USER_ID, role: 'USER', email: 'kokyaku@example.com', status: 'SUSPENDED' });

    const res = await callWithToken();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('有効な会員は今までどおり操作できる', async () => {
    userFindUnique.mockResolvedValue({ id: USER_ID, role: 'USER', email: 'kokyaku@example.com', status: 'ACTIVE' });

    const res = await callWithToken();

    expect(res.status).toBe(200);
  });

  it('退会などでアカウントが無くなっていれば未認証として扱う', async () => {
    userFindUnique.mockResolvedValue(null);

    const res = await callWithToken();

    expect(res.status).toBe(401);
  });

  it('権限はトークンではなくデータベースの値を使う（降格が即座に効く）', async () => {
    // トークンにはADMINと書いてあるが、データベース上は一般会員に戻されている
    userFindUnique.mockResolvedValue({ id: USER_ID, role: 'USER', email: 'kokyaku@example.com', status: 'ACTIVE' });
    const { createApp } = await import('../app');
    const { signAccessToken } = await import('../utils/jwt');
    const token = signAccessToken({ sub: USER_ID, role: 'ADMIN', email: 'kokyaku@example.com' });

    const res = await request(createApp()).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('凍結された会員は、ログインしていない人として商品を見ることはできる', async () => {
    userFindUnique.mockResolvedValue({ id: USER_ID, role: 'USER', email: 'kokyaku@example.com', status: 'SUSPENDED' });
    const { createApp } = await import('../app');
    const { signAccessToken } = await import('../utils/jwt');
    const token = signAccessToken({ sub: USER_ID, role: 'USER', email: 'kokyaku@example.com' });

    // optionalAuth を通る経路（商品一覧）は、未ログイン扱いで表示できる必要がある
    const res = await request(createApp()).get('/api/products').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';

/**
 * 店主(ADMIN)アカウントの凍結を拒むことを確かめる。
 *
 * 管理画面から新たな管理者を作成する手段は無い（FR-076）。もしAPIがADMINの
 * 凍結を許してしまうと、唯一の店主が自分自身をロックアウトした場合に
 * 誰もログインできなくなり、データベースを直接操作するしか復旧手段が無くなる。
 * 一覧画面はADMIN行に凍結ボタンを出さないが、API単体でも必ず拒む必要がある。
 */

const ADMIN_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';

const ADMIN_ACCOUNT = { id: ADMIN_ID, role: 'ADMIN', email: 'owner@soloshop.example.com', status: 'ACTIVE' };

/**
 * requireAuth（リクエストのたびにアカウントが有効かを読み直す）と
 * ルート側（凍結対象の取得）の両方が user.findUnique を呼ぶため、IDで引き分ける。
 */
const accounts = new Map<string, unknown>();
const userFindUnique = vi.fn(async (args: { where: { id: string } }) => accounts.get(args.where.id) ?? null);
const userUpdate = vi.fn();
const refreshTokenDeleteMany = vi.fn();

vi.mock('../config/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...(args as [{ where: { id: string } }])),
      update: (...args: unknown[]) => userUpdate(...args),
    },
    refreshToken: {
      deleteMany: (...args: unknown[]) => refreshTokenDeleteMany(...args),
    },
  },
}));

async function suspend(targetId: string) {
  const { createApp } = await import('../app');
  const { signAccessToken } = await import('../utils/jwt');
  const token = signAccessToken({ sub: ADMIN_ID, role: 'ADMIN', email: 'owner@soloshop.example.com' });
  return request(createApp())
    .patch(`/api/admin/users/${targetId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'SUSPENDED' });
}

describe('店主アカウントの凍結防止', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accounts.clear();
    accounts.set(ADMIN_ID, ADMIN_ACCOUNT);
  });

  it('ADMINロールのアカウントは凍結できない（ロックアウト防止）', async () => {
    const res = await suspend(ADMIN_ID);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_SUSPEND_ADMIN');
    expect(userUpdate).not.toHaveBeenCalled();
    expect(refreshTokenDeleteMany).not.toHaveBeenCalled();
  });

  it('一般会員は通常どおり凍結できる', async () => {
    accounts.set(USER_ID, { id: USER_ID, role: 'USER', email: 'u@example.com', status: 'ACTIVE' });
    userUpdate.mockResolvedValue({ id: USER_ID, role: 'USER', status: 'SUSPENDED', email: 'u@example.com', name: 'テスト', createdAt: new Date() });

    const res = await suspend(USER_ID);

    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: USER_ID }, data: { status: 'SUSPENDED' } });
    expect(refreshTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });

  it('存在しない会員を凍結しようとすると404', async () => {
    const res = await suspend('30000000-0000-4000-8000-000000000003');

    expect(res.status).toBe(404);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

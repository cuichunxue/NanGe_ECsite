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

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const refreshTokenDeleteMany = vi.fn();

vi.mock('../config/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
    refreshToken: {
      deleteMany: (...args: unknown[]) => refreshTokenDeleteMany(...args),
    },
  },
}));

const ADMIN_ID = '10000000-0000-4000-8000-000000000001';

describe('店主アカウントの凍結防止', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ADMINロールのアカウントは凍結できない（ロックアウト防止）', async () => {
    userFindUnique.mockResolvedValue({ id: ADMIN_ID, role: 'ADMIN', status: 'ACTIVE' });

    const { createApp } = await import('../app');
    const { signAccessToken } = await import('../utils/jwt');
    const app = createApp();
    const token = signAccessToken({ sub: ADMIN_ID, role: 'ADMIN', email: 'owner@soloshop.example.com' });

    const res = await request(app)
      .patch(`/api/admin/users/${ADMIN_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_SUSPEND_ADMIN');
    expect(userUpdate).not.toHaveBeenCalled();
    expect(refreshTokenDeleteMany).not.toHaveBeenCalled();
  });

  it('一般会員は通常どおり凍結できる', async () => {
    const targetId = '20000000-0000-4000-8000-000000000002';
    userFindUnique.mockResolvedValue({ id: targetId, role: 'USER', status: 'ACTIVE' });
    userUpdate.mockResolvedValue({ id: targetId, role: 'USER', status: 'SUSPENDED', email: 'u@example.com', name: 'テスト', createdAt: new Date() });

    const { createApp } = await import('../app');
    const { signAccessToken } = await import('../utils/jwt');
    const app = createApp();
    const token = signAccessToken({ sub: ADMIN_ID, role: 'ADMIN', email: 'owner@soloshop.example.com' });

    const res = await request(app)
      .patch(`/api/admin/users/${targetId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: targetId }, data: { status: 'SUSPENDED' } });
    expect(refreshTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: targetId } });
  });
});

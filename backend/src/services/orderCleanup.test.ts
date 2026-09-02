import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * 支払われなかった注文の在庫を戻す処理。
 *
 * 誤って代金引換の注文を取り消すと、購入者は商品が届くのを待っているのに
 * 注文が消える。逆に戻し漏れると、一点物が売り場から消えたままになる。
 * どちらも実害が大きいので、対象の絞り込みを固定しておく。
 */

const orderFindMany = vi.fn();
const orderUpdateMany = vi.fn();
const orderItemFindMany = vi.fn();
const productUpdate = vi.fn();

const tx = {
  order: { updateMany: orderUpdateMany },
  orderItem: { findMany: orderItemFindMany },
  product: { update: productUpdate },
};

vi.mock('../config/prisma', () => ({
  prisma: {
    order: { findMany: (...a: unknown[]) => orderFindMany(...a) },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));
vi.mock('../config/env', () => ({ env: { paymentHoldMinutes: 60 } }));

beforeEach(() => {
  vi.clearAllMocks();
  orderItemFindMany.mockResolvedValue([{ productId: 'p1', quantity: 2 }]);
});

describe('放置された注文の在庫返却', () => {
  it('代金引換を除外し、保持期限を過ぎた注文だけを対象にする', async () => {
    const { releaseAbandonedOrders } = await import('./orderCleanup.service');
    orderFindMany.mockResolvedValue([]);
    const now = new Date('2026-08-10T12:00:00Z');

    await releaseAbandonedOrders(now);

    const where = orderFindMany.mock.calls[0][0].where;
    expect(where.status).toBe('PENDING_PAYMENT');
    expect(where.paymentMethod).toEqual({ not: 'COD' });
    // 60分より前に作られた注文だけが対象
    expect(where.createdAt.lt).toEqual(new Date('2026-08-10T11:00:00Z'));
  });

  it('取り消せた注文の在庫を戻す', async () => {
    const { releaseAbandonedOrders } = await import('./orderCleanup.service');
    orderFindMany.mockResolvedValue([{ id: 'o1', orderNo: 'SS1' }]);
    orderUpdateMany.mockResolvedValue({ count: 1 });

    const released = await releaseAbandonedOrders(new Date());

    expect(released).toBe(1);
    expect(productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { increment: 2 }, salesCount: { decrement: 2 } } }),
    );
  });

  it('直前に入金が確定した注文の在庫は戻さない', async () => {
    const { releaseAbandonedOrders } = await import('./orderCleanup.service');
    orderFindMany.mockResolvedValue([{ id: 'o1', orderNo: 'SS1' }]);
    // 取り消し対象を絞った更新が0件 = その間に支払い済みになった
    orderUpdateMany.mockResolvedValue({ count: 0 });

    const released = await releaseAbandonedOrders(new Date());

    expect(released).toBe(0);
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('1件失敗しても残りの注文を処理する', async () => {
    const { releaseAbandonedOrders } = await import('./orderCleanup.service');
    orderFindMany.mockResolvedValue([
      { id: 'o1', orderNo: 'SS1' },
      { id: 'o2', orderNo: 'SS2' },
    ]);
    orderUpdateMany.mockRejectedValueOnce(new Error('DBが一時的に応答しない')).mockResolvedValue({ count: 1 });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const released = await releaseAbandonedOrders(new Date());

    expect(released).toBe(1);
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * 取り消された注文の在庫が売り場に戻ることを確かめる。
 *
 * 一点物を扱う個人店では、戻し漏れがそのまま「二度と売れない商品」になる。
 * 購入者による取り消しと店主による取り消しは別の関数を通るため、
 * どちらの経路でも在庫が戻ることを固定しておく。
 */

const orderUpdateMany = vi.fn();
const productUpdate = vi.fn();
const orderItemFindMany = vi.fn();
const orderFindUnique = vi.fn();
const orderFindUniqueOrThrow = vi.fn();

const tx = {
  order: { updateMany: orderUpdateMany, findUniqueOrThrow: orderFindUniqueOrThrow },
  orderItem: { findMany: orderItemFindMany },
  product: { update: productUpdate },
};

vi.mock('../config/prisma', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => orderFindUnique(...args),
      updateMany: (...args: unknown[]) => orderUpdateMany(...args),
      findUniqueOrThrow: (...args: unknown[]) => orderFindUniqueOrThrow(...args),
    },
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));
vi.mock('./orderNotification.service', () => ({
  notifyOrderPlaced: vi.fn(),
  notifyOrderShipped: vi.fn(),
  notifyOwnerOrderPaid: vi.fn(),
  notifyOwnerCodOrder: vi.fn(),
}));
vi.mock('./komoju.service', () => ({
  isKomojuConfigured: () => false,
  createPaymentSession: vi.fn(),
  refundPayment: vi.fn(),
}));

const ORDER_ID = 'order-1';
const ITEMS = [
  { productId: 'p1', quantity: 2 },
  { productId: 'p2', quantity: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  orderItemFindMany.mockResolvedValue(ITEMS);
  orderFindUniqueOrThrow.mockResolvedValue({ id: ORDER_ID });
});

function restoredQuantities() {
  return productUpdate.mock.calls.map((call) => ({
    productId: call[0].where.id,
    increment: call[0].data.stock.increment,
  }));
}

describe('注文の取り消しと在庫', () => {
  it('購入者が取り消すと在庫が戻る', async () => {
    const { cancelOrder } = await import('./order.service');
    orderFindUnique.mockResolvedValue({ id: ORDER_ID, userId: 'u1', status: 'PENDING_PAYMENT' });
    orderUpdateMany.mockResolvedValue({ count: 1 });

    await cancelOrder('u1', ORDER_ID);

    expect(restoredQuantities()).toEqual([
      { productId: 'p1', increment: 2 },
      { productId: 'p2', increment: 1 },
    ]);
  });

  it('店主が管理画面で取り消しても在庫が戻る', async () => {
    const { adminUpdateStatus } = await import('./order.service');
    orderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      userId: 'u1',
      status: 'PENDING_PAYMENT',
      paymentMethod: 'CREDIT_CARD',
      paymentId: null,
      orderNo: 'SS1',
    });
    orderUpdateMany.mockResolvedValue({ count: 1 });

    await adminUpdateStatus(ORDER_ID, 'CANCELLED');

    expect(restoredQuantities()).toEqual([
      { productId: 'p1', increment: 2 },
      { productId: 'p2', increment: 1 },
    ]);
  });

  it('取り消しが競合に負けたときは在庫を戻さない（二重返却の防止）', async () => {
    const { adminUpdateStatus } = await import('./order.service');
    orderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      userId: 'u1',
      status: 'PENDING_PAYMENT',
      paymentMethod: 'CREDIT_CARD',
      paymentId: null,
      orderNo: 'SS1',
    });
    orderUpdateMany.mockResolvedValue({ count: 0 });

    await expect(adminUpdateStatus(ORDER_ID, 'CANCELLED')).rejects.toThrow();
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('入金が確認できていないオンライン決済の注文は発送できない', async () => {
    const { adminUpdateStatus } = await import('./order.service');
    orderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      userId: 'u1',
      status: 'PENDING_PAYMENT',
      paymentMethod: 'CREDIT_CARD',
      paymentId: null,
      orderNo: 'SS1',
    });

    await expect(adminUpdateStatus(ORDER_ID, 'SHIPPED')).rejects.toThrow(/入金が確認できていない/);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('代金引換は入金前でも発送できる', async () => {
    const { adminUpdateStatus } = await import('./order.service');
    orderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      userId: 'u1',
      status: 'PENDING_PAYMENT',
      paymentMethod: 'COD',
      paymentId: null,
      orderNo: 'SS1',
    });
    orderUpdateMany.mockResolvedValue({ count: 1 });

    await expect(adminUpdateStatus(ORDER_ID, 'SHIPPED')).resolves.toBeDefined();
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('発送前(PAID)の返金は在庫を戻す（商品を送っていないため）', async () => {
    const { adminUpdateStatus } = await import('./order.service');
    orderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      userId: 'u1',
      status: 'PAID',
      paymentMethod: 'CREDIT_CARD',
      paymentId: null,
      orderNo: 'SS1',
    });
    orderUpdateMany.mockResolvedValue({ count: 1 });

    await adminUpdateStatus(ORDER_ID, 'REFUNDED');

    expect(restoredQuantities()).toEqual([
      { productId: 'p1', increment: 2 },
      { productId: 'p2', increment: 1 },
    ]);
  });

  it('発送後(SHIPPED)の返金は在庫を自動で戻さない（返送品の状態確認が要るため）', async () => {
    const { adminUpdateStatus } = await import('./order.service');
    orderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      userId: 'u1',
      status: 'SHIPPED',
      paymentMethod: 'CREDIT_CARD',
      paymentId: null,
      orderNo: 'SS1',
    });
    orderUpdateMany.mockResolvedValue({ count: 1 });

    await adminUpdateStatus(ORDER_ID, 'REFUNDED');

    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('受取完了(COMPLETED)後も返金できる（不良品・誤配送の返金に対応するため）', async () => {
    const { adminUpdateStatus } = await import('./order.service');
    orderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      userId: 'u1',
      status: 'COMPLETED',
      paymentMethod: 'CREDIT_CARD',
      paymentId: null,
      orderNo: 'SS1',
    });
    orderUpdateMany.mockResolvedValue({ count: 1 });

    await expect(adminUpdateStatus(ORDER_ID, 'REFUNDED')).resolves.toBeDefined();
    // 受取後の返金は、返送品の状態を確認してから店主が手動で在庫調整する
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('受取完了(COMPLETED)から発送済みへは戻せない', async () => {
    const { adminUpdateStatus } = await import('./order.service');
    orderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      userId: 'u1',
      status: 'COMPLETED',
      paymentMethod: 'CREDIT_CARD',
      paymentId: null,
      orderNo: 'SS1',
    });

    await expect(adminUpdateStatus(ORDER_ID, 'SHIPPED')).rejects.toThrow(/変更はできません/);
  });
});

describe('KOMOJUの返金通知(Webhook)と在庫', () => {
  // markOrderRefunded は、KOMOJUのダッシュボードから直接返金された場合にも
  // この通知だけを頼りに確定させる。adminUpdateStatus を経由しない経路でも
  // 同じ判断（発送前の返金だけ在庫を戻す）が働くことを確かめる。
  it('発送前(PAID)からの返金通知は在庫を戻す', async () => {
    const { markOrderRefunded } = await import('./order.service');
    orderUpdateMany.mockResolvedValueOnce({ count: 1 });

    const applied = await markOrderRefunded(ORDER_ID);

    expect(applied).toBe(true);
    expect(restoredQuantities()).toEqual([
      { productId: 'p1', increment: 2 },
      { productId: 'p2', increment: 1 },
    ]);
  });

  it('発送後(SHIPPED/COMPLETED)からの返金通知は在庫を自動で戻さない', async () => {
    const { markOrderRefunded } = await import('./order.service');
    // PAIDからの更新はヒットせず(0件)、SHIPPED/COMPLETEDからの更新がヒットする想定
    orderUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const applied = await markOrderRefunded(ORDER_ID);

    expect(applied).toBe(true);
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('既に返金済みの通知が再送されても、二重に在庫を戻さない', async () => {
    const { markOrderRefunded } = await import('./order.service');
    orderUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });

    const applied = await markOrderRefunded(ORDER_ID);

    expect(applied).toBe(false);
    expect(productUpdate).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';

/**
 * 「どの商品を1点買っても送料無料になる」状態をダッシュボードが知らせることを確かめる。
 *
 * 販売中でいちばん安い商品が送料無料の基準額以上になると、何を1点買っても
 * 送料が0円になり、配送費は全額が店主の負担になる。金額の計算自体は正しく
 * 行われるため画面上どこにも異常が出ず、気づかないまま利益が削られていく。
 * 実際に5,200〜9,800円の服だけを扱う店を再現したところ、32件すべてが送料無料に
 * なり、22,900円（売上の7.6%）を店主が負担していた。
 * ダッシュボードに出す判定なので、境界の扱いを固定しておく。
 */

const productCount = vi.fn();
const productFindFirst = vi.fn();
const orderAggregate = vi.fn();
const orderGroupBy = vi.fn();
const orderFindMany = vi.fn();

vi.mock('../config/prisma', () => ({
  prisma: {
    user: { count: vi.fn().mockResolvedValue(0) },
    order: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: (...args: unknown[]) => orderAggregate(...args),
      groupBy: (...args: unknown[]) => orderGroupBy(...args),
      findMany: (...args: unknown[]) => orderFindMany(...args),
    },
    product: {
      count: (...args: unknown[]) => productCount(...args),
      findFirst: (...args: unknown[]) => productFindFirst(...args),
    },
  },
}));

const ADMIN_ID = '10000000-0000-4000-8000-000000000001';

async function fetchDashboard() {
  const { createApp } = await import('../app');
  const { signAccessToken } = await import('../utils/jwt');
  const token = signAccessToken({ sub: ADMIN_ID, role: 'ADMIN', email: 'owner@soloshop.example.com' });
  return request(createApp()).get('/api/admin/dashboard').set('Authorization', `Bearer ${token}`);
}

describe('送料無料になりっぱなしの状態を知らせる', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productCount.mockResolvedValue(0);
    orderAggregate.mockResolvedValue({ _sum: { totalAmount: 0 } });
    orderGroupBy.mockResolvedValue([]);
    orderFindMany.mockResolvedValue([]);
  });

  it('いちばん安い商品が基準額を超えていると知らせる', async () => {
    const { FREE_SHIPPING_THRESHOLD } = await import('../config/shipping');
    productFindFirst.mockResolvedValue({ price: FREE_SHIPPING_THRESHOLD + 200 });

    const res = await fetchDashboard();

    expect(res.status).toBe(200);
    expect(res.body.data.alwaysFreeShipping).toBe(true);
    expect(res.body.data.freeShippingThreshold).toBe(FREE_SHIPPING_THRESHOLD);
    expect(res.body.data.cheapestProductPrice).toBe(FREE_SHIPPING_THRESHOLD + 200);
  });

  it('基準額ちょうどでも送料無料になるため知らせる（境界）', async () => {
    const { FREE_SHIPPING_THRESHOLD } = await import('../config/shipping');
    productFindFirst.mockResolvedValue({ price: FREE_SHIPPING_THRESHOLD });

    const res = await fetchDashboard();

    expect(res.body.data.alwaysFreeShipping).toBe(true);
  });

  it('基準額を1円でも下回る商品があれば知らせない（送料を頂ける余地が残る）', async () => {
    const { FREE_SHIPPING_THRESHOLD } = await import('../config/shipping');
    productFindFirst.mockResolvedValue({ price: FREE_SHIPPING_THRESHOLD - 1 });

    const res = await fetchDashboard();

    expect(res.body.data.alwaysFreeShipping).toBe(false);
    expect(res.body.data.cheapestProductPrice).toBe(FREE_SHIPPING_THRESHOLD - 1);
  });

  it('販売中の商品が1点も無いときは知らせない', async () => {
    productFindFirst.mockResolvedValue(null);

    const res = await fetchDashboard();

    expect(res.body.data.alwaysFreeShipping).toBe(false);
    expect(res.body.data.cheapestProductPrice).toBeNull();
  });

  it('判定に使うのは販売中(ON_SALE)の商品だけ（非公開の安い商品は数えない）', async () => {
    const { FREE_SHIPPING_THRESHOLD } = await import('../config/shipping');
    productFindFirst.mockResolvedValue({ price: FREE_SHIPPING_THRESHOLD + 1 });

    await fetchDashboard();

    expect(productFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ON_SALE' }, orderBy: { price: 'asc' } }),
    );
  });
});

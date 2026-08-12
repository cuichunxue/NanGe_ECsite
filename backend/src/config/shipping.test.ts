import { describe, expect, it } from 'vitest';
import { calculateShippingFee, resolveShippingRegion, FREE_SHIPPING_THRESHOLD } from './shipping';

describe('地域別の送料', () => {
  it('都道府県から地域区分を判定する', () => {
    expect(resolveShippingRegion('北海道')).toBe('hokkaido');
    expect(resolveShippingRegion('沖縄県')).toBe('okinawa');
    expect(resolveShippingRegion('福岡県')).toBe('kyushu');
    expect(resolveShippingRegion('東京都')).toBe('main');
    expect(resolveShippingRegion('香川県')).toBe('main');
  });

  it('「県」「都」を省いた表記でも判定できる', () => {
    expect(resolveShippingRegion('沖縄')).toBe('okinawa');
    expect(resolveShippingRegion('鹿児島')).toBe('kyushu');
  });

  it('未入力や不明な地名は本州・四国として扱う', () => {
    expect(resolveShippingRegion('')).toBe('main');
    expect(resolveShippingRegion(null)).toBe('main');
    expect(resolveShippingRegion('どこか')).toBe('main');
  });

  it('遠方ほど送料が高い', () => {
    const tokyo = calculateShippingFee(1000, '東京都');
    const fukuoka = calculateShippingFee(1000, '福岡県');
    const hokkaido = calculateShippingFee(1000, '北海道');
    const okinawa = calculateShippingFee(1000, '沖縄県');
    expect(tokyo).toBeLessThan(fukuoka);
    expect(fukuoka).toBeLessThan(hokkaido);
    expect(hokkaido).toBeLessThan(okinawa);
  });

  it('一定額以上は地域にかかわらず無料', () => {
    for (const province of ['東京都', '北海道', '沖縄県']) {
      expect(calculateShippingFee(FREE_SHIPPING_THRESHOLD, province)).toBe(0);
      expect(calculateShippingFee(FREE_SHIPPING_THRESHOLD - 1, province)).toBeGreaterThan(0);
    }
  });
});

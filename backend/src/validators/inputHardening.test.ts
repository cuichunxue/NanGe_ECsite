import { describe, expect, it } from 'vitest';
import { createAddressSchema } from './addressValidators';
import { createProductSchema } from './productValidators';
import { PREFECTURES } from '../config/shipping';

/**
 * 「通ってしまうと店主が損をする入力」を止めていることを確かめる。
 *
 * 都道府県は送料の地域区分を決める値なので、一覧に無い表記を受け付けてはならない。
 * 実際に試したところ「おきなわ」と入力された注文は本州扱いになり、送料1,200円の
 * ところ500円しか頂けなかった（1件あたり700円の持ち出し）。
 * 価格の小数は消費税の割り戻しに端数を残し、領収書の金額が合わなくなる。
 */

const address = (over: Record<string, unknown> = {}) => ({
  body: { recipient: '検証 太郎', phone: '09011112222', province: '東京都', city: '渋谷区', district: '神南', detail: '1-2-3', postalCode: '1500041', ...over },
});
const product = (over: Record<string, unknown> = {}) => ({
  body: {
    name: 'リネンシャツ', description: 'リネンシャツです。手作業で仕立てた一点ものの服で、生地から選んでいます。',
    sku: 'CL-001', categoryId: '10000000-0000-4000-8000-000000000001', price: 8800, stock: 5, images: [], taxRate: 10, ...over,
  },
});

describe('届け先の検証', () => {
  it('47都道府県はすべて受け付ける', () => {
    for (const pref of PREFECTURES) {
      expect(createAddressSchema.safeParse(address({ province: pref })).success, pref).toBe(true);
    }
  });

  it.each(['沖縄', 'おきなわ', '東京', 'ニューヨーク州', '13', ''])(
    '一覧に無い都道府県「%s」は受け付けない（送料の区分が決まらないため）',
    (province) => {
      expect(createAddressSchema.safeParse(address({ province })).success).toBe(false);
    },
  );

  it.each(['1500041', '150-0041'])('郵便番号「%s」は受け付ける', (postalCode) => {
    expect(createAddressSchema.safeParse(address({ postalCode })).success).toBe(true);
  });

  it.each(['abc1234', '12', '15000411', 'ゼロ番地'])('形になっていない郵便番号「%s」は受け付けない', (postalCode) => {
    expect(createAddressSchema.safeParse(address({ postalCode })).success).toBe(false);
  });

  it.each(['09011112222', '090-1111-2222', '03-1234-5678', '+81 90 1111 2222'])(
    '電話番号「%s」は受け付ける',
    (phone) => {
      expect(createAddressSchema.safeParse(address({ phone })).success).toBe(true);
    },
  );

  it.each(['でんわ', '090-1111', '', 'あ'.repeat(15)])('連絡のつかない電話番号「%s」は受け付けない', (phone) => {
    expect(createAddressSchema.safeParse(address({ phone })).success).toBe(false);
  });

  it('前後の空白だけの入力は未入力として扱う', () => {
    expect(createAddressSchema.safeParse(address({ recipient: '   ' })).success).toBe(false);
  });
});

describe('商品の検証', () => {
  it('通常の価格は受け付ける', () => {
    expect(createProductSchema.safeParse(product({ price: 19800 })).success).toBe(true);
  });

  it.each([
    ['小数（円に補助単位は無い）', 1234.56],
    ['0円', 0],
    ['マイナス', -1000],
    ['文字列', 'たかい'],
    ['データベースの範囲を超える桁', 999999999999999],
  ])('価格が%sのときは受け付けない', (_label, price) => {
    expect(createProductSchema.safeParse(product({ price })).success).toBe(false);
  });

  it('商品説明の長さに上限がある', () => {
    expect(createProductSchema.safeParse(product({ description: 'あ'.repeat(5001) })).success).toBe(false);
    expect(createProductSchema.safeParse(product({ description: 'あ'.repeat(5000) })).success).toBe(true);
  });

  it('空白だけの商品名は受け付けない', () => {
    expect(createProductSchema.safeParse(product({ name: '   ' })).success).toBe(false);
  });

  it('在庫数は0以上の整数だけ受け付ける', () => {
    expect(createProductSchema.safeParse(product({ stock: 0 })).success).toBe(true);
    expect(createProductSchema.safeParse(product({ stock: -1 })).success).toBe(false);
    expect(createProductSchema.safeParse(product({ stock: 2.5 })).success).toBe(false);
  });
});

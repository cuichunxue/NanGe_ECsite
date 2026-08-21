import { describe, it, expect } from 'vitest';
import { PAYMENT_METHODS, PAYMENT_METHOD_KEYS, paymentLabel, isOnlinePayment, komojuTypeFor } from './payment';
// 画面用の一覧。バックエンド(入力チェック・決済依頼)と画面(選択肢の表示)で
// 食い違うと、選べるのに決済できない支払い方法が出てしまうため突き合わせる。
import {
  PAYMENT_METHODS as FRONT_METHODS,
  isOnlinePayment as frontIsOnlinePayment,
  paymentLabel as frontPaymentLabel,
} from '../../../frontend/assets/js/payment.js';

describe('支払い方法', () => {
  it('代金引換以外はKOMOJUの決済ページへ遷移する', () => {
    expect(isOnlinePayment('CREDIT_CARD')).toBe(true);
    expect(isOnlinePayment('PAYPAY')).toBe(true);
    expect(isOnlinePayment('WECHAT_PAY')).toBe(true);
    expect(isOnlinePayment('COD')).toBe(false);
  });

  it('KOMOJUに渡す決済手段名が正しい', () => {
    // KOMOJU公式SDK(@komoju/komoju-sdk)のPaymentType列挙に合わせている
    expect(komojuTypeFor('CREDIT_CARD')).toBe('credit_card');
    expect(komojuTypeFor('PAYPAY')).toBe('paypay');
    expect(komojuTypeFor('WECHAT_PAY')).toBe('wechatpay');
    expect(komojuTypeFor('COD')).toBeNull();
  });

  it('未知の支払い方法でも例外にせず、空の表示に落とす', () => {
    expect(isOnlinePayment('BITCOIN')).toBe(false);
    expect(komojuTypeFor('BITCOIN')).toBeNull();
    expect(paymentLabel('BITCOIN')).toBe('');
    expect(paymentLabel(null)).toBe('');
  });

  it('入力チェック用のキー一覧が一覧と一致している', () => {
    expect(PAYMENT_METHOD_KEYS).toEqual(PAYMENT_METHODS.map((m) => m.key));
  });

  it('キーが重複していない（保存済みの注文と取り違えないため）', () => {
    expect(new Set(PAYMENT_METHOD_KEYS).size).toBe(PAYMENT_METHOD_KEYS.length);
  });

  it('現金で受け取る方法はちょうど1つ（代金引換）', () => {
    // 増えた場合、入金前に発送してよいかの判断(isCashOnDelivery)を見直す必要がある
    const offline = PAYMENT_METHODS.filter((m) => !m.komojuType);
    expect(offline.map((m) => m.key)).toEqual(['COD']);
  });

  it('フロントエンドの一覧と一致している', () => {
    const shape = (list: { key: string; label: string; komojuType: string | null }[]) =>
      list.map((m) => `${m.key}:${m.label}:${m.komojuType ?? '-'}`);
    expect(shape(FRONT_METHODS)).toEqual(shape(PAYMENT_METHODS));

    for (const m of PAYMENT_METHODS) {
      expect(frontIsOnlinePayment(m.key)).toBe(isOnlinePayment(m.key));
      expect(frontPaymentLabel(m.key)).toBe(paymentLabel(m.key));
    }
  });
});

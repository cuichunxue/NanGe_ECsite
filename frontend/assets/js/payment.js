// 支払い方法の一覧。
// バックエンド(backend/src/config/payment.ts)と内容を一致させること。
// 食い違うと、選べるのに決済できない支払い方法が画面に出てしまう。

export const PAYMENT_METHODS = [
  { key: 'CREDIT_CARD', label: 'クレジットカード', komojuType: 'credit_card' },
  { key: 'PAYPAY', label: 'PayPay', komojuType: 'paypay' },
  {
    key: 'WECHAT_PAY',
    label: 'WeChat Pay',
    komojuType: 'wechatpay',
    note: 'WeChat Payのアカウントが必要です',
  },
  {
    key: 'COD',
    label: '代金引換',
    komojuType: null,
    note: '商品お受け取り時に配達員へお支払いください',
  },
];

export function findPaymentMethod(key) {
  return PAYMENT_METHODS.find((m) => m.key === key) ?? null;
}

export function paymentLabel(key) {
  return findPaymentMethod(key)?.label ?? '';
}

/** KOMOJUの決済ページへ遷移する方法かどうか（代金引換だけが false） */
export function isOnlinePayment(key) {
  return Boolean(findPaymentMethod(key)?.komojuType);
}

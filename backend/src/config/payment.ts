/**
 * 支払い方法の一覧。
 * フロントエンド(frontend/assets/js/payment.js)と内容を一致させること。
 *
 * 支払い方法は「決済ページの選択肢」「入力チェック」「注文詳細の表示」「管理画面の表示」と
 * 複数の場所から参照される。ここにまとめておくことで、追加や廃止のときに
 * 直し漏れた場所だけ挙動が食い違う、という事故を防ぐ。
 */

export interface PaymentMethod {
  /** 当サイト内での呼び名。注文レコードの paymentMethod に保存される */
  key: string;
  /** 購入者に見せる名前 */
  label: string;
  /**
   * KOMOJU側の呼び名。決済ページへ遷移させる方法はここに値が入る。
   * 代金引換のようにKOMOJUを経由しない方法は null。
   */
  komojuType: string | null;
  /** 選ぶときの補足。購入者が迷わないよう、条件があるものには書く */
  note?: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
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

export const PAYMENT_METHOD_KEYS = PAYMENT_METHODS.map((m) => m.key);

export function findPaymentMethod(key: string | null | undefined): PaymentMethod | null {
  if (!key) return null;
  return PAYMENT_METHODS.find((m) => m.key === key) ?? null;
}

export function paymentLabel(key: string | null | undefined): string {
  return findPaymentMethod(key)?.label ?? '';
}

/**
 * KOMOJUの決済ページへ遷移する方法かどうか（代金引換だけが false）。
 * 真なら key は必ず値を持つ文字列なので、そのまま決済依頼に渡せる。
 */
export function isOnlinePayment(key: string | null | undefined): key is string {
  return Boolean(findPaymentMethod(key)?.komojuType);
}

/** KOMOJUに渡す決済手段名。オンライン決済でなければ null */
export function komojuTypeFor(key: string | null | undefined): string | null {
  return findPaymentMethod(key)?.komojuType ?? null;
}

/**
 * 画面用の支払い方法一覧（frontend/assets/js/payment.js）の型。
 *
 * この一覧はバックエンド（backend/src/config/payment.ts）と同じ内容でなければならず、
 * payment.test.ts が両者を突き合わせている。ビルド対象の外にあるJavaScriptを
 * テストから読むための宣言で、実行時のバックエンドはこのファイルを使わない。
 */
declare module '*/frontend/assets/js/payment.js' {
  export const PAYMENT_METHODS: { key: string; label: string; komojuType: string | null; note?: string; fee?: number }[];
  export function findPaymentMethod(key: string | null | undefined): { key: string; label: string } | null;
  export function paymentLabel(key: string | null | undefined): string;
  export function isOnlinePayment(key: string | null | undefined): boolean;
  export function paymentFeeFor(key: string | null | undefined): number;
}

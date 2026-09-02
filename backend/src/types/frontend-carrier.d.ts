/**
 * 画面用の配送業者対応表（frontend/assets/js/carrier.js）の型。
 *
 * この対応表はメール用（backend/src/config/carrier.ts）と同じ内容でなければならず、
 * carrier.test.ts が両者を突き合わせている。ビルド対象の外にあるJavaScriptを
 * テストから読むための宣言で、実行時のバックエンドはこのファイルを使わない。
 */
declare module '*/frontend/assets/js/carrier.js' {
  export const CARRIERS: { key: string; label: string; trackingUrl: ((trackingNumber: string) => string) | null }[];
  export function findCarrier(key: string | null | undefined): { key: string; label: string } | null;
  export function carrierLabel(key: string | null | undefined): string;
  export function trackingUrlFor(carrierKey: string | null | undefined, trackingNumber: string | null | undefined): string | null;
}

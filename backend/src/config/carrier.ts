/**
 * 配送業者と荷物追跡ページの対応。
 * フロントエンド(frontend/assets/js/carrier.js)と内容を一致させること。
 *
 * 追跡URLの仕様は配送業者側の都合で変わることがある。開かなくなった場合は
 * ここの `trackingUrl` を直せば、購入者向けの表示とメールの両方に反映される。
 */

export interface Carrier {
  key: string;
  label: string;
  /** 追跡番号を差し込んで追跡ページのURLを作る。番号だけ伝える業者はnull。 */
  trackingUrl: ((trackingNumber: string) => string) | null;
}

export const CARRIERS: Carrier[] = [
  {
    key: 'yamato',
    label: 'ヤマト運輸',
    trackingUrl: (n) => `https://member.kms.kuronekoyamato.co.jp/parcel/detail?pno=${encodeURIComponent(n)}`,
  },
  {
    key: 'japanpost',
    label: '日本郵便',
    trackingUrl: (n) =>
      `https://trackings.post.japanpost.jp/services/srv/search/direct?locale=ja&reqCodeNo1=${encodeURIComponent(n)}`,
  },
  {
    key: 'sagawa',
    label: '佐川急便',
    trackingUrl: (n) => `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${encodeURIComponent(n)}`,
  },
  {
    // 追跡に対応しない発送方法（定形外郵便など）や、上記以外の業者を使う場合。
    // 追跡番号を空のまま発送できるようにしておかないと、これらの方法が使えなくなる。
    key: 'other',
    label: 'その他',
    trackingUrl: null,
  },
];

export const CARRIER_KEYS = CARRIERS.map((c) => c.key);

export function findCarrier(key: string | null | undefined): Carrier | null {
  if (!key) return null;
  return CARRIERS.find((c) => c.key === key) ?? null;
}

export function carrierLabel(key: string | null | undefined): string {
  return findCarrier(key)?.label ?? '';
}

/** 追跡ページのURL。業者が未対応、または追跡番号が無い場合はnull。 */
export function trackingUrlFor(carrierKey: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  const carrier = findCarrier(carrierKey);
  if (!carrier?.trackingUrl || !trackingNumber) return null;
  return carrier.trackingUrl(trackingNumber);
}

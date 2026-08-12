// 配送業者と荷物追跡ページの対応。
// バックエンド(backend/src/config/carrier.ts)と内容を一致させること。
// 追跡URLの仕様は配送業者側の都合で変わることがあるため、開かなくなったら両方を直す。

export const CARRIERS = [
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
  // 追跡に対応しない発送方法（定形外郵便など）や、上記以外の業者
  { key: 'other', label: 'その他', trackingUrl: null },
];

export function findCarrier(key) {
  return CARRIERS.find((c) => c.key === key) ?? null;
}

export function carrierLabel(key) {
  return findCarrier(key)?.label ?? '';
}

/** 追跡ページのURL。業者が未対応、または追跡番号が無ければ null */
export function trackingUrlFor(carrierKey, trackingNumber) {
  const carrier = findCarrier(carrierKey);
  if (!carrier?.trackingUrl || !trackingNumber) return null;
  return carrier.trackingUrl(trackingNumber);
}

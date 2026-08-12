// 送料設定。バックエンド(backend/src/config/shipping.ts)と値・区分を一致させること。
// 画面に表示する金額はここで計算するが、注文時に確定するのはバックエンドの計算結果。

export const FREE_SHIPPING_THRESHOLD = 5000;

/** 地域区分と、その区分の送料 */
export const SHIPPING_REGIONS = [
  { key: 'okinawa', label: '沖縄', fee: 1200 },
  { key: 'hokkaido', label: '北海道', fee: 900 },
  { key: 'kyushu', label: '九州', fee: 700 },
  { key: 'main', label: '本州・四国', fee: 500 },
];

/** 送料が最も安い区分の金額。届け先が決まる前の目安表示に使う。 */
export const BASE_SHIPPING_FEE = Math.min(...SHIPPING_REGIONS.map((r) => r.fee));

const PREFECTURE_REGION = {
  北海道: 'hokkaido',
  沖縄県: 'okinawa',
  福岡県: 'kyushu',
  佐賀県: 'kyushu',
  長崎県: 'kyushu',
  熊本県: 'kyushu',
  大分県: 'kyushu',
  宮崎県: 'kyushu',
  鹿児島県: 'kyushu',
};

const DEFAULT_REGION = 'main';

export function resolveShippingRegion(province) {
  if (!province) return DEFAULT_REGION;
  const name = String(province).trim();
  if (PREFECTURE_REGION[name]) return PREFECTURE_REGION[name];
  const matched = Object.keys(PREFECTURE_REGION).find((pref) => pref.startsWith(name) || name.startsWith(pref));
  return matched ? PREFECTURE_REGION[matched] : DEFAULT_REGION;
}

export function shippingFeeForRegion(region) {
  return SHIPPING_REGIONS.find((r) => r.key === region)?.fee ?? BASE_SHIPPING_FEE;
}

export function calculateShippingFee(subtotal, province) {
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return shippingFeeForRegion(resolveShippingRegion(province));
}

/** 「本州・四国¥500 / 九州¥700 …」のような案内文 */
export function shippingFeeSummary() {
  return SHIPPING_REGIONS.slice()
    .reverse()
    .map((r) => `${r.label} ¥${r.fee.toLocaleString('ja-JP')}`)
    .join(' / ');
}

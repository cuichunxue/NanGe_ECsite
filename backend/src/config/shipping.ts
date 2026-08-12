/**
 * 送料設定。フロントエンド(frontend/assets/js/shipping.js)と値・区分を一致させること。
 *
 * 宅配便の実費は届け先で変わり、とくに北海道・沖縄は本州より大幅に高い。
 * 全国一律にすると遠方の注文ほど持ち出しが増えるため、地域ごとに分けている。
 */

export const FREE_SHIPPING_THRESHOLD = 5000;

/** 地域区分と、その区分の送料 */
export const SHIPPING_REGIONS = [
  { key: 'okinawa', label: '沖縄', fee: 1200 },
  { key: 'hokkaido', label: '北海道', fee: 900 },
  { key: 'kyushu', label: '九州', fee: 700 },
  { key: 'main', label: '本州・四国', fee: 500 },
] as const;

export type ShippingRegionKey = (typeof SHIPPING_REGIONS)[number]['key'];

/** 都道府県 → 地域区分。ここに無い場合は本州・四国として扱う。 */
const PREFECTURE_REGION: Record<string, ShippingRegionKey> = {
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

const DEFAULT_REGION: ShippingRegionKey = 'main';

/**
 * 都道府県名から地域区分を求める。
 * 入力の表記ゆれ（「沖縄」「東京」など「県」「都」の省略）にも耐えるようにする。
 */
export function resolveShippingRegion(province: string | null | undefined): ShippingRegionKey {
  if (!province) return DEFAULT_REGION;
  const name = province.trim();
  if (PREFECTURE_REGION[name]) return PREFECTURE_REGION[name];
  const matched = Object.keys(PREFECTURE_REGION).find((pref) => pref.startsWith(name) || name.startsWith(pref));
  return matched ? PREFECTURE_REGION[matched] : DEFAULT_REGION;
}

export function shippingFeeForRegion(region: ShippingRegionKey): number {
  return SHIPPING_REGIONS.find((r) => r.key === region)?.fee ?? SHIPPING_REGIONS[SHIPPING_REGIONS.length - 1].fee;
}

/**
 * 送料を求める。一定額以上のご購入は地域にかかわらず無料とする
 * （地域ごとに無料条件を変えると、購入者にとって分かりにくくなるため）。
 */
export function calculateShippingFee(subtotal: number, province?: string | null): number {
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return shippingFeeForRegion(resolveShippingRegion(province));
}

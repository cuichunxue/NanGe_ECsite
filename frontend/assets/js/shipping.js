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


// 都道府県の一覧（送料の地域区分に使うため、表記ゆれが起きないよう選択式にする）。
export const PREFECTURES = [
  '北海道',
  '青森県',
  '岩手県',
  '宮城県',
  '秋田県',
  '山形県',
  '福島県',
  '茨城県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '富山県',
  '石川県',
  '福井県',
  '山梨県',
  '長野県',
  '岐阜県',
  '静岡県',
  '愛知県',
  '三重県',
  '滋賀県',
  '京都府',
  '大阪府',
  '兵庫県',
  '奈良県',
  '和歌山県',
  '鳥取県',
  '島根県',
  '岡山県',
  '広島県',
  '山口県',
  '徳島県',
  '香川県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
];

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

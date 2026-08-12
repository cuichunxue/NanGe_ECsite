/**
 * 消費税の計算。フロントエンド(frontend/assets/js/tax.js)と結果を一致させること。
 *
 * 価格はすべて税込で保持・表示する（消費者向けの総額表示）。そこから税率ごとに
 * 内訳を割り戻して求める。
 *
 * 重要: 端数処理は「税率ごとに、請求書1枚につき1回」だけ行う。
 * 明細行ごとに端数処理して合計すると、インボイス制度が求める記載と合わなくなる。
 */

export const STANDARD_TAX_RATE = 10;
/** 軽減税率。飲食料品（酒類・外食を除く）と定期購読の新聞が対象。 */
export const REDUCED_TAX_RATE = 8;
export const TAX_RATES = [STANDARD_TAX_RATE, REDUCED_TAX_RATE] as const;
export type TaxRate = (typeof TAX_RATES)[number];

export function isValidTaxRate(rate: number): rate is TaxRate {
  return (TAX_RATES as readonly number[]).includes(rate);
}

export interface TaxableLine {
  /** 税込の金額（単価 × 数量） */
  taxIncludedAmount: number;
  taxRate: number;
}

export interface TaxBreakdownEntry {
  taxRate: number;
  /** その税率の税込合計 */
  taxIncludedAmount: number;
  /** その税率の消費税額（税率ごとに1回だけ端数処理した結果） */
  taxAmount: number;
  /** その税率の税抜合計 */
  taxExcludedAmount: number;
  /** 軽減税率の対象か（請求書に「※」等で明示する必要がある） */
  reduced: boolean;
}

/**
 * 税込金額の一覧から、税率ごとの内訳を求める。
 * 端数は切り捨て（消費者に不利にならない側）で統一する。
 */
export function calculateTaxBreakdown(lines: TaxableLine[]): TaxBreakdownEntry[] {
  const totals = new Map<number, number>();
  for (const line of lines) {
    const rate = isValidTaxRate(line.taxRate) ? line.taxRate : STANDARD_TAX_RATE;
    totals.set(rate, (totals.get(rate) ?? 0) + line.taxIncludedAmount);
  }

  return [...totals.entries()]
    .sort((a, b) => b[0] - a[0]) // 標準税率を先に並べる
    .map(([taxRate, taxIncludedAmount]) => {
      // 税込金額から割り戻す。合計してから1回だけ端数処理する。
      const taxAmount = Math.floor((taxIncludedAmount * taxRate) / (100 + taxRate));
      return {
        taxRate,
        taxIncludedAmount,
        taxAmount,
        taxExcludedAmount: taxIncludedAmount - taxAmount,
        reduced: taxRate === REDUCED_TAX_RATE,
      };
    });
}

/** 送料は標準税率。商品の明細と合わせて内訳を求めるために使う。 */
export function shippingTaxLine(shippingFee: number): TaxableLine[] {
  return shippingFee > 0 ? [{ taxIncludedAmount: shippingFee, taxRate: STANDARD_TAX_RATE }] : [];
}

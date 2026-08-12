import { describe, expect, it } from 'vitest';
import { calculateTaxBreakdown, shippingTaxLine } from './tax';

/**
 * 消費税の内訳。
 *
 * インボイス制度では、端数処理は「税率ごとに、請求書1枚につき1回」と決まっている。
 * 明細行ごとに処理して合計すると請求書の記載額と合わなくなるため、ここを固定しておく。
 */
describe('消費税の内訳', () => {
  it('税込金額から税率ごとに割り戻す', () => {
    const result = calculateTaxBreakdown([{ taxIncludedAmount: 1100, taxRate: 10 }]);
    expect(result).toEqual([
      { taxRate: 10, taxIncludedAmount: 1100, taxAmount: 100, taxExcludedAmount: 1000, reduced: false },
    ]);
  });

  it('標準税率と軽減税率を分けて集計し、標準税率を先に並べる', () => {
    const result = calculateTaxBreakdown([
      { taxIncludedAmount: 1400, taxRate: 8 },
      { taxIncludedAmount: 2400, taxRate: 10 },
      { taxIncludedAmount: 2200, taxRate: 8 },
    ]);
    expect(result.map((r) => r.taxRate)).toEqual([10, 8]);
    expect(result[0]).toMatchObject({ taxIncludedAmount: 2400, taxAmount: 218 });
    // 軽減税率は 1400 + 2200 = 3600 をまとめてから割り戻す
    expect(result[1]).toMatchObject({ taxIncludedAmount: 3600, taxAmount: 266, reduced: true });
  });

  it('端数処理は税率ごとに1回だけ行う（行ごとに処理した場合と区別できること）', () => {
    // 1行ずつ割り戻すと 33 + 33 + 33 = 99 になるが、
    // 合計 1100 からまとめて割り戻すと 100 が正しい。
    const lines = [
      { taxIncludedAmount: 367, taxRate: 10 },
      { taxIncludedAmount: 367, taxRate: 10 },
      { taxIncludedAmount: 366, taxRate: 10 },
    ];
    const perLine = lines.reduce((sum, l) => sum + Math.floor((l.taxIncludedAmount * 10) / 110), 0);
    const [entry] = calculateTaxBreakdown(lines);

    expect(perLine).toBe(99);
    expect(entry.taxAmount).toBe(100);
    expect(entry.taxIncludedAmount).toBe(1100);
  });

  it('税抜額と消費税額を足すと税込額に戻る', () => {
    for (const amount of [1, 108, 999, 1234, 45678]) {
      for (const rate of [10, 8]) {
        const [entry] = calculateTaxBreakdown([{ taxIncludedAmount: amount, taxRate: rate }]);
        expect(entry.taxExcludedAmount + entry.taxAmount).toBe(amount);
      }
    }
  });

  it('未知の税率は標準税率として扱う', () => {
    const result = calculateTaxBreakdown([{ taxIncludedAmount: 1100, taxRate: 5 }]);
    expect(result[0].taxRate).toBe(10);
  });

  it('送料は標準税率の明細として加える。無料なら明細を作らない', () => {
    expect(shippingTaxLine(500)).toEqual([{ taxIncludedAmount: 500, taxRate: 10 }]);
    expect(shippingTaxLine(0)).toEqual([]);
  });
});

// プロキシ印刷のレイアウト計算（面付け・センタリング・ページ数）の単体テスト
import { describe, it, expect } from 'vitest';
import { computeLayout, expandSequence, pageCount, CARD_W_MM, CARD_H_MM } from '../src/lib/proxyPdf';

describe('proxyPdf レイアウト計算', () => {
  it('A3横は 6×3 = 18枚/頁（間隔0mm）', () => {
    const L = computeLayout('a3', 0);
    expect(L.cols).toBe(6);
    expect(L.rows).toBe(3);
    expect(L.perPage).toBe(18);
    expect(L.pageW).toBe(420);
    expect(L.pageH).toBe(297);
  });

  it('A4縦は 3×3 = 9枚/頁（間隔0mm）', () => {
    const L = computeLayout('a4', 0);
    expect(L.cols).toBe(3);
    expect(L.rows).toBe(3);
    expect(L.perPage).toBe(9);
  });

  it('間隔2mmでもA3は18枚/頁のまま・グリッドは用紙内に収まりセンタリングされる', () => {
    const L = computeLayout('a3', 2);
    expect(L.perPage).toBe(18);
    expect(L.gridW).toBe(6 * CARD_W_MM + 5 * 2);
    expect(L.gridH).toBe(3 * CARD_H_MM + 2 * 2);
    expect(L.gridW).toBeLessThanOrEqual(L.pageW);
    expect(L.gridH).toBeLessThanOrEqual(L.pageH);
    expect(L.originX).toBeCloseTo((L.pageW - L.gridW) / 2, 5);
    expect(L.originY).toBeCloseTo((L.pageH - L.gridH) / 2, 5);
    expect(L.originX).toBeGreaterThan(0);
    expect(L.originY).toBeGreaterThan(0);
  });

  it('カードサイズは常にスタンダード63×88mm（等倍印刷前提）', () => {
    for (const p of ['a3', 'a4'] as const) {
      const L = computeLayout(p, 1);
      expect(L.cardW).toBe(63);
      expect(L.cardH).toBe(88);
    }
  });

  it('expandSequence は枚数どおり展開し、0枚・負数は無視する', () => {
    const seq = expandSequence([
      { no: 'OP01-001', count: 1 },
      { no: 'OP01-025', count: 4 },
      { no: 'OP01-016', count: 0 },
    ]);
    expect(seq.length).toBe(5);
    expect(seq.filter((n) => n === 'OP01-025').length).toBe(4);
    expect(seq.includes('OP01-016')).toBe(false);
  });

  it('51枚デッキ（リーダー込み）は A3 で3頁・A4 で6頁', () => {
    expect(pageCount(51, 'a3', 0)).toBe(3);
    expect(pageCount(51, 'a4', 0)).toBe(6);
    expect(pageCount(18, 'a3', 0)).toBe(1);
    expect(pageCount(19, 'a3', 0)).toBe(2);
  });
});

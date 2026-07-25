// プロキシ印刷用PDF生成。
// 公式カード画像（weserv プロキシ経由＝CORS可・原寸600×838px≒242dpi）を
// スタンダードサイズ 63×88mm・等倍(100%)印刷前提で用紙に敷き詰める。
// - A3横: 6×3 = 18枚/頁（51枚デッキ→3頁） / A4縦: 3×3 = 9枚/頁
// - 同一カードは画像を1回だけ埋め込んで使い回す（ファイルサイズ節約＝netprint 10MB制限対策）
// - PNGのまま埋め込む（公式画像は角丸透過つき。JPEG化すると角が潰れるため再エンコードしない）
import { PDFDocument, rgb, type PDFPage, type PDFImage } from 'pdf-lib';

const MM = 72 / 25.4; // mm → pt
export const CARD_W_MM = 63;
export const CARD_H_MM = 88;

export type ProxyPaper = 'a3' | 'a4';

export interface ProxyLayout {
  paper: ProxyPaper;
  cols: number; rows: number; perPage: number;
  pageW: number; pageH: number;   // mm
  originX: number; originY: number; // グリッド左上（用紙内センタリング・mm）
  gridW: number; gridH: number;   // mm
  cardW: number; cardH: number;   // mm
  gap: number;                    // カード間隔 mm
}

// 用紙とカード間隔から敷き詰めレイアウトを計算（純関数・テスト対象）
export function computeLayout(paper: ProxyPaper, gapMm: number): ProxyLayout {
  const [pageW, pageH] = paper === 'a3' ? [420, 297] : [210, 297]; // A3は横置き
  const cols = Math.floor((pageW + gapMm) / (CARD_W_MM + gapMm));
  const rows = Math.floor((pageH + gapMm) / (CARD_H_MM + gapMm));
  const gridW = cols * CARD_W_MM + (cols - 1) * gapMm;
  const gridH = rows * CARD_H_MM + (rows - 1) * gapMm;
  return {
    paper, cols, rows, perPage: cols * rows,
    pageW, pageH,
    originX: (pageW - gridW) / 2, originY: (pageH - gridH) / 2,
    gridW, gridH, cardW: CARD_W_MM, cardH: CARD_H_MM, gap: gapMm,
  };
}

// {no,count} の列を印刷順の並び（ページ分割前の1次元列）へ展開（純関数・テスト対象）
export function expandSequence(cards: Array<{ no: string; count: number }>): string[] {
  const seq: string[] = [];
  for (const c of cards) for (let i = 0; i < (c.count | 0); i++) seq.push(c.no);
  return seq;
}

// 公式カード画像（PNG原寸）を weserv 経由で取得（CORS可）。失敗は1回だけリトライ。
async function fetchCardPng(no: string): Promise<ArrayBuffer> {
  const url = `https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/images/cardlist/card/${encodeURIComponent(no)}.png`;
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.arrayBuffer();
    } catch (e) {
      if (attempt >= 1) throw new Error(`画像の取得に失敗: ${no}`);
      await new Promise((res) => setTimeout(res, 600));
    }
  }
}

// 切り取りガイド（断ちトンボ）: グリッド外周の余白に、各カード端の延長線を描く
function drawMarks(page: PDFPage, L: ProxyLayout): void {
  const color = rgb(0.6, 0.6, 0.6);
  const lw = 0.5;             // pt
  const len = 3.5 * MM;       // ガイド線の長さ
  const off = 0.8 * MM;       // グリッドからの逃げ
  const pageHpt = L.pageH * MM;

  const xs = new Set<number>();
  for (let i = 0; i < L.cols; i++) {
    const x0 = L.originX + i * (L.cardW + L.gap);
    xs.add(x0); xs.add(x0 + L.cardW);
  }
  const ys = new Set<number>();
  for (let j = 0; j < L.rows; j++) {
    const y0 = L.originY + j * (L.cardH + L.gap); // 上起点(mm)
    ys.add(y0); ys.add(y0 + L.cardH);
  }
  const gridTopPt = pageHpt - L.originY * MM;              // グリッド上端（pdf座標=左下起点）
  const gridBotPt = pageHpt - (L.originY + L.gridH) * MM;  // グリッド下端
  const gridLeftPt = L.originX * MM;
  const gridRightPt = (L.originX + L.gridW) * MM;

  for (const xm of xs) {
    const x = xm * MM;
    page.drawLine({ start: { x, y: gridTopPt + off }, end: { x, y: Math.min(pageHpt, gridTopPt + off + len) }, thickness: lw, color });
    page.drawLine({ start: { x, y: gridBotPt - off }, end: { x, y: Math.max(0, gridBotPt - off - len) }, thickness: lw, color });
  }
  for (const ym of ys) {
    const y = pageHpt - ym * MM;
    page.drawLine({ start: { x: gridLeftPt - off, y }, end: { x: Math.max(0, gridLeftPt - off - len), y }, thickness: lw, color });
    page.drawLine({ start: { x: gridRightPt + off, y }, end: { x: Math.min(L.pageW * MM, gridRightPt + off + len), y }, thickness: lw, color });
  }
}

export interface BuildOpts {
  paper: ProxyPaper;
  gapMm: number;
  marks: boolean;
  onProgress?: (done: number, total: number) => void; // 画像取得の進捗
}

// カード列（{no,count}）から印刷用PDFのバイト列を生成
export async function buildProxyPdf(cards: Array<{ no: string; count: number }>, opts: BuildOpts): Promise<Uint8Array> {
  const uniq = cards.filter((c) => (c.count | 0) > 0);
  if (uniq.length === 0) throw new Error('印刷するカードがありません');

  const doc = await PDFDocument.create();
  doc.setTitle('OPCG Proxy');

  // 画像はユニークカードごとに1回だけ取得・埋め込み（同名4枚でも1画像を使い回す）
  const imgs = new Map<string, PDFImage>();
  let done = 0;
  for (const c of uniq) {
    const bytes = await fetchCardPng(c.no);
    imgs.set(c.no, await doc.embedPng(bytes));
    opts.onProgress?.(++done, uniq.length);
  }

  const L = computeLayout(opts.paper, opts.gapMm);
  const seq = expandSequence(uniq);
  const pageWpt = L.pageW * MM, pageHpt = L.pageH * MM;

  for (let p = 0; p < seq.length; p += L.perPage) {
    const page = doc.addPage([pageWpt, pageHpt]);
    const slice = seq.slice(p, p + L.perPage);
    slice.forEach((no, i) => {
      const col = i % L.cols, row = Math.floor(i / L.cols);
      const xMm = L.originX + col * (L.cardW + L.gap);
      const yTopMm = L.originY + row * (L.cardH + L.gap);
      page.drawImage(imgs.get(no)!, {
        x: xMm * MM,
        y: pageHpt - (yTopMm + L.cardH) * MM, // pdf-lib は左下起点
        width: L.cardW * MM,
        height: L.cardH * MM,
      });
    });
    if (opts.marks) drawMarks(page, L);
  }

  return doc.save();
}

// ページ数（UI表示用）
export function pageCount(totalCards: number, paper: ProxyPaper, gapMm: number): number {
  const L = computeLayout(paper, gapMm);
  return Math.ceil(totalCards / L.perPage);
}

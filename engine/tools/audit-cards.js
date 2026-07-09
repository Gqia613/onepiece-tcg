#!/usr/bin/env node
/* tools/audit-cards.js — 公式完全スナップショット(official-full.json) ↔ ゲーム実データ(マージ後C) ↔ 効果実装(CARD_FX) の三点照合。
   使い方: node tools/audit-cards.js            … 全体集計＋ audit-report.json 生成
           node tools/audit-cards.js OP01 ST13  … セット指定でそのセットの差分明細も表示
   前提: node tools/scrape-official-full.js を先に実行して official-full.json を最新化しておく。
   照合内容（公式が正本）:
     - presence      … 公式にあるのに CARD_DB/C に無い（スクレイプ漏れ・新カード）／逆（廃止・改名）
     - 数値/分類     … type / cost / life / power / counter / color / traits / attribute
     - text_mismatch … 効果テキスト不一致（00-data.js の手書きdefが公式を上書きしている差分もここで出る）
     - trigger_*     … 公式トリガーあり×fx.trigger未実装（trigger_unimplemented）／逆（trigger_extra）
                       ※cards.js の text にはトリガー句がそもそも入っていない（公式HTMLで別divのため）
     - fx_missing    … 効果テキストあり（キーワードのみを除く）なのに fx が無い
   出力: tools/audit-report.json（フェーズ2実装セッションの作業正本。実装後に再実行すれば解消済みが消える＝自己更新）。
   注意: リーダー固有ロジックの一部（lucy/ace/enel/teach）は fx でなくハードコード実装のため fx_missing に出ることがある（レポートの type:LEADER を目視確認）。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── 読み込み ──────────────────────────────────────────────
const official = JSON.parse(rd('tools/official-full.json'));
const ctx = { window: {}, console };
for (const f of ['cards.js', 'cards-fx.js', 'cards-attr.js']) vm.runInNewContext(rd(f), ctx, { filename: f });
vm.runInNewContext(rd('src/00-data.js') + '\n;window.__C=(typeof C!=="undefined")?C:null;', ctx, { filename: '00-data.js' });
const C = ctx.window.__C, CARD_FX = ctx.window.CARD_FX, CARD_DB = ctx.window.CARD_DB;
if (!C || !CARD_FX || !CARD_DB) { console.error('読み込み失敗: C/CARD_FX/CARD_DB'); process.exit(1); }

// ── 正規化 ──────────────────────────────────────────────
const normText = s => (s || '').replace(/\s+/g, '')
  .replace(/！/g, '!').replace(/？/g, '?').replace(/：/g, ':')
  .replace(/（/g, '(').replace(/）/g, ')').replace(/!!/g, '‼')
  .replace(/^-$/, '');
const sameSet = (a, b) => { a = [...(a || [])].sort().join('/'); b = [...(b || [])].sort().join('/'); return a === b; };
const setOf = no => (no.match(/^(OP\d+|EB\d+|PRB\d+|ST\d+)-/) || [])[1] || (no.match(/^(P)-/) ? 'P' : 'OTHER');
// キーワードのみのテキストか（fx不要＝mergeCardDBがテキスト由来でキーワード派生する）
// エンジン側で別機構により処理済みのルール文も除外: 枚数無制限=builderValidate / 別名=mergeCardDB別名抽出
const keywordOnly = t => {
  let s = normText(t).replace(/\([^)]*\)/g, ''); // 注釈括弧を除去
  s = s.replace(/【速攻】|【ブロッカー】|【バニッシュ】|【ダブルアタック】|【キャラ速攻】/g, '');
  s = s.replace(/ルール上、このカードはデッキに何枚でも入れる(こと|事)ができる。?/g, '');
  s = s.replace(/ルール上、このカードはカード名を「[^」]+」としても扱う。?/g, '');
  return s === '';
};
// fxでなくエンジン本体にハードコード実装済みのリーダー（fx_missing誤検出の抑止。§8参照）
const HARDCODED = {
  'OP15-002': 'lucyリーダー: leaderActivate/lucyCounterで実装済',
  'OP15-058': 'enelリーダー: leaderActivate+donDeck:6で実装済',
  'OP16-080': 'teachリーダー: コスト+1静的/リダイレクトで実装済',
};
const hasFx = no => {
  const c = C[no];
  if (c && c.fx && Object.keys(c.fx).length) return true;
  const fx = CARD_FX[no];
  return !!(fx && Object.keys(fx).length);
};
const hasTriggerFx = no => {
  const c = C[no];
  if (c && c.fx && c.fx.trigger) return true;
  const fx = CARD_FX[no];
  return !!(fx && fx.trigger);
};

// ── 照合 ──────────────────────────────────────────────
const issues = []; // {no,set,name,type,kind,field,official,current}
const push = (o, kind, field, off, cur) => issues.push({ no: o.no, set: setOf(o.no), name: o.name, type: o.type, kind, field: field || null, official: off === undefined ? null : off, current: cur === undefined ? null : cur });
const offByNo = {};
for (const o of official) {
  offByNo[o.no] = o;
  const c = C[o.no];
  if (!c) { push(o, 'missing_in_db'); continue; }
  // 数値/分類（公式が正本。C＝ゲームが実際に使う値と比較＝defの上書き差分も検出）
  if (c.type !== o.type) push(o, 'field_mismatch', 'type', o.type, c.type);
  if (o.type === 'LEADER') { if ((c.life ?? null) !== o.life) push(o, 'field_mismatch', 'life', o.life, c.life ?? null); }
  else if ((c.cost ?? null) !== o.cost) push(o, 'field_mismatch', 'cost', o.cost, c.cost ?? null);
  if ((c.power || 0) !== o.power) push(o, 'field_mismatch', 'power', o.power, c.power || 0);
  if ((c.counter || 0) !== o.counter) push(o, 'field_mismatch', 'counter', o.counter, c.counter || 0);
  if (!sameSet(c.color, o.color)) push(o, 'field_mismatch', 'color', (o.color || []).join('/'), (c.color || []).join('/'));
  if (!sameSet(c.traits, o.traits)) push(o, 'field_mismatch', 'traits', (o.traits || []).join('/'), (c.traits || []).join('/'));
  if (o.attribute && (c.attribute || null) !== o.attribute) push(o, 'field_mismatch', 'attribute', o.attribute, c.attribute || null);
  // テキスト（本文のみ。トリガーは別建て）
  if (normText(c.text) !== normText(o.text)) push(o, 'text_mismatch', 'text', o.text, c.text || '');
  // トリガー
  if (o.trigger && !hasTriggerFx(o.no)) push(o, 'trigger_unimplemented', 'trigger', o.trigger, null);
  if (!o.trigger && hasTriggerFx(o.no)) push(o, 'trigger_extra', 'trigger', '', 'fx.triggerあり');
  // fx有無（効果テキストがあるのに実装なし。ハードコード済みリーダーは除外）
  const baseNo = o.no.replace(/_r\d+$/, '');
  if (o.text && !keywordOnly(o.text) && !hasFx(o.no) && !HARDCODED[baseNo]) push(o, 'fx_missing', 'fx', o.text, null);
}
for (const c of CARD_DB) if (!offByNo[c.no]) push({ no: c.no, name: c.name, type: c.type }, 'db_stale');

// ── 集計・出力 ──────────────────────────────────────────
const byKind = {}, bySet = {};
for (const i of issues) {
  byKind[i.kind] = (byKind[i.kind] || 0) + 1;
  (bySet[i.set] = bySet[i.set] || { total: 0 })[i.kind] = ((bySet[i.set] || {})[i.kind] || 0) + 1;
  bySet[i.set].total++;
}
const report = {
  generatedAt: new Date().toISOString(),
  officialCards: official.length, dbCards: CARD_DB.length, fxEntries: Object.keys(CARD_FX).length,
  summary: { totalIssues: issues.length, byKind, bySet },
  issues
};
fs.writeFileSync(path.join(ROOT, 'tools', 'audit-report.json'), JSON.stringify(report, null, 1));

console.log(`公式 ${official.length}枚 / DB ${CARD_DB.length}枚 / fx ${Object.keys(CARD_FX).length}件`);
console.log('問題種別:', JSON.stringify(byKind, null, 1));
const order = Object.keys(bySet).sort();
console.log('\nセット別 (total | fx_missing | trigger_unimpl | text | field):');
for (const s of order) {
  const b = bySet[s];
  console.log(`  ${s.padEnd(6)} ${String(b.total).padStart(4)} | ${String(b.fx_missing || 0).padStart(4)} | ${String(b.trigger_unimplemented || 0).padStart(4)} | ${String(b.text_mismatch || 0).padStart(4)} | ${String((b.total - (b.fx_missing || 0) - (b.trigger_unimplemented || 0) - (b.text_mismatch || 0) - (b.trigger_extra || 0) - (b.missing_in_db || 0) - (b.db_stale || 0))).padStart(4)}`);
}
// セット指定の明細表示
const args = process.argv.slice(2);
if (args.length) {
  for (const s of args) {
    console.log(`\n===== ${s} 明細 =====`);
    for (const i of issues.filter(x => x.set === s)) {
      console.log(`${i.no} ${i.name} [${i.kind}${i.field ? ':' + i.field : ''}]`);
      if (i.official != null) console.log(`  公式: ${String(i.official).slice(0, 120)}`);
      if (i.current != null) console.log(`  現状: ${String(i.current).slice(0, 120)}`);
    }
  }
}
console.log(`\n→ tools/audit-report.json 生成済（実装後に再実行すれば解消分は消える）`);

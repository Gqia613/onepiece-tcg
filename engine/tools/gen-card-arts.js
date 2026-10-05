#!/usr/bin/env node
/* tools/gen-card-arts.js — 公式カードリストから「絵違い（パラレル _pN / 再録別イラスト _rN）」の一覧を取得し cards-arts.js を生成する。
   使い方: node tools/gen-card-arts.js   （新弾追加時は scrape-official-full.js の SERIES に足してから再実行）
   - 絵違いは効果・数値が本体(base)と同一＝ゲーム上は同じカード。デッキに絵柄番号（例 OP16-063_p2）で入れられるようにするための表示用データ。
   - 出力: cards-arts.js（window.CARD_ARTS = { base: [[variantNo, 収録弾コード], ...] }）。base が公式に存在しない孤立番号は収録しない。
   - mergeCardDB（src/00-data.js）が C[variantNo] を本体カードへの「非列挙エイリアス」として登録する
     （C[variantNo] === C[base]。Object.keys(C) には出ない＝プール/AIの重複なし。inst.no だけが絵柄番号を保持し画像に使われる）。
   依存: Node.js + curl のみ。SERIES は scrape-official-full.js から読む（二重管理しない）。 */
const cp = require('child_process'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'cards-arts.js');
const SERIES = JSON.parse('[' + /const SERIES = \[([\s\S]*?)\];/.exec(fs.readFileSync(path.join(__dirname, 'scrape-official-full.js'), 'utf8'))[1].replace(/\s+/g, '').replace(/,$/, '') + ']');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/120 Safari/537.36';
function fetchSeries(id) {
  try { return cp.execSync(`curl -sL -m 40 --compressed -A ${JSON.stringify(UA)} ${JSON.stringify('https://www.onepiece-cardgame.com/cardlist/?series=' + id)}`, { maxBuffer: 1 << 26, encoding: 'utf8' }); }
  catch (e) { return ''; }
}
// scrape-official-full.js の SETCODE と同じ規則（550701/550801/550901 は番号の接頭辞で代用）
const setCode = (id, no) => {
  if (id > 550000 && id <= 550099) return 'ST' + String(id - 550000).padStart(2, '0');
  if (id > 550100 && id <= 550199) return 'OP' + String(id - 550100).padStart(2, '0');
  if (id > 550200 && id <= 550299) return 'EB' + String(id - 550200).padStart(2, '0');
  if (id > 550300 && id <= 550399) return 'PRB' + String(id - 550300).padStart(2, '0');
  return no.split('-')[0];
};
const DB = JSON.parse(fs.readFileSync(path.join(ROOT, 'cards.js'), 'utf8').replace(/^window\.CARD_DB=/, '').replace(/;\s*$/, ''));
const known = new Set(DB.map(c => c.no));
const arts = {}; const seen = new Set(); const failed = [];
for (const id of SERIES) {
  let html = fetchSeries(id);
  if (!html || html.length < 2000) { cp.execSync('sleep 2'); html = fetchSeries(id); }
  if (!html || html.length < 2000) { failed.push(id); console.error('skip(取得失敗)', id); continue; }
  let n = 0;
  for (const m of html.matchAll(/<dl class="modalCol" id="([^"]+)"/g)) {
    const no = m[1]; const mm = /^(.+)_([pr]\d+)$/.exec(no); if (!mm) continue;
    const base = mm[1];
    if (!known.has(base) || seen.has(no)) continue; // 本体の無い孤立番号は cards.js 側で実体として扱われている
    seen.add(no); n++;
    (arts[base] = arts[base] || []).push([no, setCode(id, base)]);
  }
  console.error(`series ${id}: 絵違い+${n} 累計=${seen.size}`);
  cp.execSync('sleep 0.25');
}
const ord = s => { const m = /_([pr])(\d+)$/.exec(s); return (m[1] === 'p' ? 0 : 1000) + +m[2]; };
const keys = Object.keys(arts).sort();
for (const k of keys) arts[k].sort((a, b) => ord(a[0]) - ord(b[0]));
fs.writeFileSync(OUT, `/* cards-arts.js — 絵違いマップ（tools/gen-card-arts.js が公式カードリストから生成。手編集しない）。
   base → [[絵柄番号, 収録弾コード], ...]（パラレル _pN / 再録別イラスト _rN）。効果・数値は base と同一。
   利用: mergeCardDB が C[絵柄番号] を base への非列挙エイリアスとして登録 → web のデッキビルダーで絵柄を選べる。 */
window.CARD_ARTS = {
${keys.map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(arts[k])).join(',\n')}
};
`);
console.log(`生成: cards-arts.js  絵違いを持つカード=${keys.length}枚 / 絵違い総数=${seen.size}`);
if (failed.length) { console.log('★取得失敗シリーズ(要再実行): ' + failed.join(', ')); process.exitCode = 1; }

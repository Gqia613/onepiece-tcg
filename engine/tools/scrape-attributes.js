#!/usr/bin/env node
/* tools/scrape-attributes.js — カード属性(斬/打/射/特/知/…)の no→属性 マップを生成。
   出典: 公式カードリストの各カード <div class="attribute"> の <img alt="斬"> アイコン。
   属性データは cards.js(CARD_DB) に含まれないため、本ツールで別ファイル cards-attr.js を生成し、
   mergeCardDB が base.attribute へ付与する（cards.js は無改変）。属性条件カード（ミホーク等）が参照。
   実行: node tools/scrape-attributes.js */
const cp = require('child_process'), fs = require('fs'), path = require('path');
// scrape-cards.js と同じ全シリーズID
const SERIES = [
  550101, 550102, 550103, 550104, 550105, 550106, 550107, 550108, 550109, 550110, 550111, 550112, 550113, 550114, 550115, 550116,
  550201, 550202, 550203, 550204, 550301, 550302,
  550001, 550002, 550003, 550004, 550005, 550006, 550007, 550008, 550009, 550010, 550011, 550012, 550013, 550014, 550015, 550016, 550017, 550018, 550019, 550020, 550021, 550022, 550023, 550024, 550025, 550026, 550027, 550028, 550029, 550030,
  550701, 550801, 550901
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/120 Safari/537.36';
function fetchSeries(id) {
  try { return cp.execSync(`curl -sL -m 40 --compressed -A ${JSON.stringify(UA)} ${JSON.stringify('https://www.onepiece-cardgame.com/cardlist/?series=' + id)}`, { maxBuffer: 1 << 26, encoding: 'utf8' }); }
  catch (e) { return ''; }
}
const attr = {};
let okSeries = 0;
for (const id of SERIES) {
  const html = fetchSeries(id);
  if (!html || html.length < 2000) { console.error('skip(空)', id); continue; }
  okSeries++;
  // カードブロックは <dl class="modalCol" ... id="OPxx-yyy"> 単位。ブロック内の attribute alt を拾う。
  const blocks = html.split(/<dl class="modalCol"/);
  let added = 0;
  for (const b of blocks) {
    const no = (b.match(/id="([A-Z0-9][A-Z0-9-]*)"/) || [])[1]; if (!no) continue;
    const a = (b.match(/class="attribute"[\s\S]{0,200}?alt="([^"]+)"/) || [])[1];
    if (a && a !== '-') { attr[no] = a; added++; }
  }
  console.error('series', id, '+' + added, '累計', Object.keys(attr).length);
}
const keys = Object.keys(attr).sort();
let out = '/* cards-attr.js — カード属性(斬/打/射/特/知/…)の no→属性 マップ。tools/scrape-attributes.js で自動生成（手編集禁止）。\n';
out += '   出典: 公式カードリスト <div class="attribute"> の <img alt>。属性は cards.js に無いため本ファイルで補完し、\n';
out += '   mergeCardDB が base.attribute へ付与する。属性条件カード（ミホーク/コビー等）が参照。 */\n';
out += 'window.CARD_ATTR = {\n';
out += keys.map(no => '  ' + JSON.stringify(no) + ': ' + JSON.stringify(attr[no])).join(',\n') + '\n';
out += '};\nif (typeof module !== "undefined") module.exports = window.CARD_ATTR;\n';
fs.writeFileSync(path.resolve(__dirname, '..', 'cards-attr.js'), out);
const byAttr = {}; for (const k of keys) byAttr[attr[k]] = (byAttr[attr[k]] || 0) + 1;
console.log('生成: cards-attr.js  属性付きカード=' + keys.length + ' / 取得シリーズ=' + okSeries + '/' + SERIES.length);
console.log('属性内訳:', JSON.stringify(byAttr));

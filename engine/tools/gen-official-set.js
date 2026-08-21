/* 弾別の旧・正本 tools/official-<set>.js を cards.js(CARD_DB.text) から生成/更新する（二重照合用スナップショット）。
   使い方: node tools/gen-official-set.js OP17 "OP-17「世界最強の戦士」" / node tools/gen-official-set.js P  */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {}; require(path.join(ROOT, 'cards.js'));
const DB = global.window.CARD_DB;
const set = process.argv[2], title = process.argv[3] || set;
const out = path.join(ROOT, 'tools', 'official-' + set.toLowerCase() + '.js');
const varName = 'OFFICIAL_' + set.toUpperCase();
// 既存ファイルがあればキー順を保つ（差分を最小化）＋新規番号を末尾に足す
let prevKeys = [];
if (fs.existsSync(out)) { global.window = {}; delete require.cache[require.resolve(out)]; require(out); prevKeys = Object.keys(global.window[varName] || {}); }
const isSet = no => no.split('-')[0] === set && !/_[pr]\d+$/.test(no);
const all = DB.filter(c => isSet(c.no)).map(c => c.no);
const keys = [...prevKeys.filter(k => all.includes(k)), ...all.filter(k => !prevKeys.includes(k))];
const map = {};
for (const no of keys) {
  const c = DB.find(x => x.no === no);
  let t = (c && (c.text || '').replace(/\s+/g, ' ').trim()) || '効果なし';
  if (/^[-‐―ー–—\s]*$/.test(t)) t = '効果なし';
  map[no] = t;
}
const body = keys.map(no => ' ' + JSON.stringify(no) + ': ' + JSON.stringify(map[no])).join(',\n');
fs.writeFileSync(out, `/* tools/official-${set.toLowerCase()}.js — ${title} 公式効果テキスト（正本スナップショット。全枚数照合用）。
   用途: 実装(fx)を公式テキストと1枚ずつ照合する際の正本。cards.js(CARD_DB.text)から再生成。 */
window.${varName} = {
${body}
};
if (typeof module !== "undefined") module.exports = window.${varName};
`);
console.log('生成: tools/official-' + set.toLowerCase() + '.js  ' + keys.length + '枚（新規 ' + all.filter(k => !prevKeys.includes(k)).length + '）');

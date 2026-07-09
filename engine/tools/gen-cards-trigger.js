#!/usr/bin/env node
/* tools/gen-cards-trigger.js — official-full.json から【トリガー】全文の no→text マップ cards-trigger.js を生成（手編集禁止）。
   実行: node tools/scrape-official-full.js → node tools/gen-cards-trigger.js
   背景: 公式HTMLはトリガーを本文<div class="text">と別の<div class="trigger">に持つため、cards.js の text には
   トリガー句が含まれない＝カード詳細表示にトリガー文が出ない。本ファイルで補完し、mergeCardDB が base.triggerText へ付与する
   （cards-attr.js と同方式。cards.js は無改変・パラレル _rN は本体を共有）。
   注意: OP01-119雷鳴八卦のように公式が本文へトリガーを埋め込む例外はここに含めない（textに既に表示されるため）。 */
const fs = require('fs'), path = require('path');
const off = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'official-full.json'), 'utf8'));
const map = {};
for (const o of off) {
  if (!o.trigger) continue;
  const base = o.no.replace(/_r\d+$/, '');
  if (!map[base]) map[base] = o.trigger; // パラレルは本体を共有（mergeCardDBのフォールバックで解決）
}
const keys = Object.keys(map).sort();
let out = '/* cards-trigger.js — 【トリガー】全文の no→text マップ。tools/gen-cards-trigger.js が official-full.json から自動生成（手編集禁止）。\n';
out += '   公式HTMLでトリガーは本文と別divのため cards.js の text に含まれない。mergeCardDB が base.triggerText へ付与し、\n';
out += '   カード詳細表示（エンジン/web）がテキストの下に表示する。パラレル(_rN)は本体noを共有。 */\n';
out += 'window.CARD_TRIGGER = {\n';
out += keys.map(no => '  ' + JSON.stringify(no) + ': ' + JSON.stringify(map[no])).join(',\n') + '\n';
out += '};\nif (typeof module !== "undefined") module.exports = window.CARD_TRIGGER;\n';
fs.writeFileSync(path.resolve(__dirname, '..', 'cards-trigger.js'), out);
console.log(`生成: cards-trigger.js  トリガー持ち=${keys.length}枚`);

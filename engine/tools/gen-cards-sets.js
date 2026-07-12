#!/usr/bin/env node
/* tools/gen-cards-sets.js — 収録弾マップ cards-sets.js を生成（正本: tools/official-full.json の sets）。
   実行: node tools/gen-cards-sets.js

   なぜ必要か: 「弾」＝カード番号の接頭辞、ではない。スタートデッキ等は他弾からの再録で構成されるため、
   接頭辞基準だとデッキビルダーの弾フィルタで新スターター（ST-31〜36 等）のリーダーも再録札も選べない。
   例) ST-31（赤ルフィ）= 新規5枚(ST31-001〜005) ＋ 再録10枚（リーダーは ST21-001 の別イラスト、他は OP11/OP13/P 等）。

   出力: cards-sets.js（window.CARD_SETS = { no: ['OP11','ST31'], ... }）。
   ★接頭辞と同じ単一弾しか持たないカード（＝大多数）は出力しない。web/エンジン側は
     「CARD_SETS[no] があればそれ、無ければ番号の接頭辞1件」とフォールバックする＝ファイルを小さく保つ。
   ★_rN（別イラスト）は base の収録弾を継承する（mergeCardDB が base番号へフォールバック）。 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const official = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'official-full.json'), 'utf8'));
const OUT = path.join(ROOT, 'cards-sets.js');

const baseOf = no => no.replace(/_[pr]\d+$/, '');
const map = {};
for (const c of official) {
  const bid = baseOf(c.no);
  if (map[bid]) continue;                     // base番号で1エントリ（_rN は継承側で解決）
  const sets = (c.sets || []).slice().sort();
  if (!sets.length) continue;
  if (sets.length === 1 && sets[0] === bid.split('-')[0]) continue; // 接頭辞と同じ単一弾＝省略（フォールバックで復元できる）
  map[bid] = sets;
}
const keys = Object.keys(map).sort();
const body = keys.map(no => '  ' + JSON.stringify(no) + ': ' + JSON.stringify(map[no])).join(',\n');
fs.writeFileSync(OUT, `/* cards-sets.js — 収録弾マップ（tools/gen-cards-sets.js が official-full.json から生成。手編集しない）。
   no → その番号が収録されている弾コードの配列。番号の接頭辞と同じ単一弾のカードは省略（利用側でフォールバック）。
   利用: mergeCardDB が base.sets に付与 → web のデッキビルダーの弾フィルタが参照。 */
window.CARD_SETS = {
${body}
};
`);
const packs = new Set(); for (const no of keys) for (const s of map[no]) packs.add(s);
console.log(`生成: cards-sets.js  複数弾/再録カード=${keys.length}枚 / 登場する弾コード=${[...packs].sort().join(' ')}`);

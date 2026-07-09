// engine/tools/official-full.json（公式スクレイプ・rarity付き）から
// web用のレア度マップ src/engine/rarity.ts を生成する。
// 登場演出のレア度勾配（SR=金リング / SEC・SP=カットイン）にだけ使うため、対象レア度のみ収録。
// 使い方: node scripts/gen-rarity.mjs   （official-full.json 更新時に再実行してコミット）
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync(new URL('../engine/tools/official-full.json', import.meta.url), 'utf8'));
const cards = Array.isArray(src) ? src : Object.values(src);
const KEEP = new Set(['SR', 'SEC', 'SP']); // L(リーダー)は登場演出の対象外（デッキ開始時から場にいる）
const out = {};
for (const c of cards) {
  if (c && c.no && KEEP.has(c.rarity)) out[c.no] = c.rarity;
}
const body = `// 自動生成: node scripts/gen-rarity.mjs（正本: engine/tools/official-full.json）。手編集しない。
// 登場演出のレア度勾配用（SR/SEC/SPのみ収録。未収録=通常演出）。
export const RARITY: Record<string, 'SR' | 'SEC' | 'SP'> = ${JSON.stringify(out)};
`;
writeFileSync(new URL('../src/engine/rarity.ts', import.meta.url), body);
console.log('wrote src/engine/rarity.ts:', Object.keys(out).length, 'cards');

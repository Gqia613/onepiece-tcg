// ルートのエンジン原本を web/src/engine/raw/ へ verbatim コピーする。
// 原本(ルート)は一切改変しない。UI層(40/50/60)は除外（Reactで作り直すため）。
// 実行: node scripts/sync-engine.mjs  （cwd は web/）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, '..');
const ROOT = resolve(WEB, '..');
const OUT = join(WEB, 'src', 'engine', 'raw');

// index.html の <script src> 順そのまま（全同梱）。
// UI層(40/50/60)も「handPlayable / tryPlayHand / uiEndTurn / cpuTurn(CPUの頭脳)」など
// ゲームロジックを多数含むため除外不可。原本は無改変で取り込み、UIフックだけ
// bootstrap の footer で注入アダプタへ再代入する（呼び出し箇所は一切編集しない）。
const FILES = [
  'cards.js',
  'cards-fx.js',
  'cards-attr.js',
  'src/00-data.js',
  'src/10-engine-core.js',
  'src/20-targeting-fx.js',
  'src/30-flow-battle.js',
  'src/40-ui-render.js',
  'src/50-input-cpu-ai.js',
  'src/60-screens-init.js',
  'src/ai-weights.js',
  'src/ai-policy.js',
  'src/ai-strategy.js',
  'src/70-ai.js',
];

mkdirSync(OUT, { recursive: true });

const manifest = [];
for (const rel of FILES) {
  const src = join(ROOT, rel);
  const flat = rel.replace(/^src\//, '').replace(/\//g, '__'); // e.g. 00-data.js
  const txt = readFileSync(src, 'utf8');
  writeFileSync(join(OUT, flat), txt);
  manifest.push(flat);
  console.log('copied', rel, '->', 'raw/' + flat, `(${txt.length}b)`);
}

// 連結順マニフェスト（bootstrap が参照）
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote manifest.json:', manifest.length, 'files');

#!/usr/bin/env node
/* tools/scrape-cards.js — 公式カードリストから全カードデータを取得し cards.js を再生成する。
   使い方: node tools/scrape-cards.js
   - 公式(onepiece-cardgame.com/cardlist)のシリーズ別HTMLを解析。新弾が出たら SERIES に ID を足して再実行。
   - 出力: リポジトリ直下の cards.js（window.CARD_DB = [...]）。index.html がこれを <script src> で読み込む。
   - 取得項目: 番号/名前/種別/色/特徴/コスト(またはライフ)/パワー/カウンター/テキスト。
   依存: Node.js + curl のみ。 */
const cp = require('child_process'), fs = require('fs'), path = require('path');
const OUT = path.resolve(__dirname, '..', 'cards.js');
// OP01-16 / EB / PRB / ST / プロモ・限定の全シリーズID（公式 series= の値）
const SERIES = [
  550101, 550102, 550103, 550104, 550105, 550106, 550107, 550108, 550109, 550110, 550111, 550112, 550113, 550114, 550115, 550116,
  550201, 550202, 550203, 550204, 550301, 550302,
  550001, 550002, 550003, 550004, 550005, 550006, 550007, 550008, 550009, 550010, 550011, 550012, 550013, 550014, 550015, 550016, 550017, 550018, 550019, 550020, 550021, 550022, 550023, 550024, 550025, 550026, 550027, 550028, 550029, 550030,
  550031, 550032, 550033, 550034, 550035, 550036,
  550701, 550801, 550901
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/120 Safari/537.36';
function fetchSeries(id) {
  try { return cp.execSync(`curl -sL -m 40 --compressed -A ${JSON.stringify(UA)} ${JSON.stringify('https://www.onepiece-cardgame.com/cardlist/?series=' + id)}`, { maxBuffer: 1 << 26, encoding: 'utf8' }); }
  catch (e) { return ''; }
}
const txt = s => (s || '').replace(/<br[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const num = s => { s = (s || '').replace(/[^\d]/g, ''); return s === '' ? null : +s; };
function parse(block) {
  const b = block.replace(/\s+/g, ' ');
  const no = (b.match(/id="([^"]+)"/) || [])[1]; if (!no) return null;
  const info = (b.match(/<div class="infoCol">([\s\S]*?)<\/div>/) || [])[1] || '';
  const spans = [...info.matchAll(/<span>([^<]*)<\/span>/g)].map(m => m[1].trim());
  const typeRaw = spans[2] || '';
  const type = { LEADER: 'LEADER', CHARACTER: 'CHAR', EVENT: 'EVENT', STAGE: 'STAGE' }[typeRaw] || typeRaw;
  const name = txt((b.match(/<div class="cardName">([\s\S]*?)<\/div>/) || [])[1]);
  const costM = b.match(/<div class="cost"><h3>([^<]*)<\/h3>([\s\S]*?)<\/div>/);
  const costVal = costM ? num(costM[2]) : null;
  const power = num((b.match(/<div class="power"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const counterRaw = txt((b.match(/<div class="counter"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const colorRaw = txt((b.match(/<div class="color"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const feature = txt((b.match(/<div class="feature"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const text = txt((b.match(/<div class="text"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const c = {
    no, name, type, color: colorRaw ? colorRaw.split(/[/／]/).map(s => s.trim()).filter(Boolean) : [],
    traits: feature ? feature.split(/[/／]/).map(s => s.trim()).filter(Boolean) : [], // 全角「／」区切りにも対応（OP05-059/OP06-057）
    power: power || 0, counter: (counterRaw === '-' || !counterRaw) ? 0 : num(counterRaw), text
  };
  if (type === 'LEADER') c.life = (costVal != null ? costVal : 5); else c.cost = (costVal != null ? costVal : 0);
  return c;
}
/* ★2パス方式（base版優先・scrape-official-full.js と対）: 他弾カードのSP再録(_pN)が
   先にスクレイプされる弾のページに載っていても、base版のデータを必ず優先する。 */
const byNo = {}; const parallels = []; let totalBlocks = 0;
for (const id of SERIES) {
  const html = fetchSeries(id);
  const blocks = html.match(/<dl class="modalCol"[\s\S]*?<\/dl>/g) || [];
  totalBlocks += blocks.length;
  for (const blk of blocks) {
    const c = parse(blk); if (!c) continue;
    const isParallel = /_p\d+$/.test(c.no);
    const base = c.no.replace(/_p\d+$/, ''); c.no = base;
    if (isParallel) { parallels.push(c); continue; }
    if (!byNo[base]) byNo[base] = c;
  }
  process.stderr.write(`series ${id}: ${blocks.length} cards (uniq ${Object.keys(byNo).length})\n`);
  cp.execSync('sleep 0.25');
}
for (const c of parallels) if (!byNo[c.no]) byNo[c.no] = c;
const cards = Object.values(byNo);
fs.writeFileSync(OUT, 'window.CARD_DB=' + JSON.stringify(cards) + ';\n');
const byType = {}; for (const c of cards) byType[c.type] = (byType[c.type] || 0) + 1;
console.log(`完了: ブロック${totalBlocks} / ユニーク${cards.length} / 種別 ${JSON.stringify(byType)} → ${OUT} (${(fs.statSync(OUT).size / 1024 | 0)}KB)`);

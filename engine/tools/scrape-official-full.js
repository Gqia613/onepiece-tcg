#!/usr/bin/env node
/* tools/scrape-official-full.js — 公式カードリストから「全フィールド」を取得し official-full.json を生成する完全正本スナップショット。
   使い方: node tools/scrape-official-full.js
   - 従来の official-opNN.js（効果テキストのみ）/ scrape-cards.js（textのみ・triggerを取り逃す）を補完する完全版。
   - 取得項目: 番号/名前/レアリティ/種別/コスト(またはライフ)/属性/パワー/カウンター/色/ブロックアイコン/特徴/テキスト/★トリガー(別div)/入手情報/シリーズID。
   - 公式HTMLの <div class="trigger"> は <div class="text"> と別ブロック（cards.js のトリガー句欠落の根本原因）。
   - 出力: tools/official-full.json（1カード1行のJSON。audit-cards.js が照合の正本として読む）。
   依存: Node.js + curl のみ。新弾が出たら SERIES に ID を足して再実行。 */
const cp = require('child_process'), fs = require('fs'), path = require('path');
const OUT = path.resolve(__dirname, 'official-full.json');
// scrape-cards.js と同じ全シリーズID（OP01-16 / EB / PRB / ST / プロモ・限定）
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
// scrape-cards.js と同一の正規化（cards.js の text と公平に比較できるようにする）
const txt = s => (s || '').replace(/<br[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const num = s => { s = (s || '').replace(/[^\d]/g, ''); return s === '' ? null : +s; };
function parse(block, seriesId) {
  const b = block.replace(/\s+/g, ' ');
  const no = (b.match(/id="([^"]+)"/) || [])[1]; if (!no) return null;
  const info = (b.match(/<div class="infoCol">([\s\S]*?)<\/div>/) || [])[1] || '';
  const spans = [...info.matchAll(/<span>([^<]*)<\/span>/g)].map(m => m[1].trim());
  const rarity = spans[1] || '';
  const typeRaw = spans[2] || '';
  const type = { LEADER: 'LEADER', CHARACTER: 'CHAR', EVENT: 'EVENT', STAGE: 'STAGE' }[typeRaw] || typeRaw;
  const name = txt((b.match(/<div class="cardName">([\s\S]*?)<\/div>/) || [])[1]);
  const costM = b.match(/<div class="cost"><h3>([^<]*)<\/h3>([\s\S]*?)<\/div>/);
  const costVal = costM ? num(costM[2]) : null;
  const attribute = (b.match(/class="attribute"[\s\S]{0,200}?alt="([^"]+)"/) || [])[1] || null;
  const power = num((b.match(/<div class="power"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const counterRaw = txt((b.match(/<div class="counter"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const colorRaw = txt((b.match(/<div class="color"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const blockIcon = txt((b.match(/<div class="block"><h3>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/) || [])[1]) || null;
  const feature = txt((b.match(/<div class="feature"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const text = txt((b.match(/<div class="text"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const trigger = txt((b.match(/<div class="trigger"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const set = txt((b.match(/<div class="getInfo"><h3>[^<]*<\/h3>([\s\S]*?)<\/div>/) || [])[1]);
  const c = {
    no, name, rarity, type,
    color: colorRaw ? colorRaw.split(/[/／]/).map(s => s.trim()).filter(Boolean) : [],
    traits: feature && feature !== '-' ? feature.split(/[/／]/).map(s => s.trim()).filter(Boolean) : [], // 公式は稀に全角「／」で特徴を区切る（OP05-059/OP06-057）。半角のみで割ると複合特徴のまま残り trait 完全一致が外れる

    attribute: attribute === '-' ? null : attribute,
    power: power || 0,
    counter: (counterRaw === '-' || !counterRaw) ? 0 : num(counterRaw),
    blockIcon: blockIcon === '-' ? null : blockIcon,
    text: (text === '-' ? '' : text),
    trigger: (trigger === '-' ? '' : trigger),
    set, series: seriesId
  };
  if (type === 'LEADER') c.life = (costVal != null ? costVal : 5); else c.cost = (costVal != null ? costVal : 0);
  return c;
}
/* ★2パス方式（base版優先）: 新弾ブースターには他弾カードのSP再録(_pN)が載る。first-winsだと
   スクレイプ順で後ろの弾（EB/PRB/ST/プロモ）のbaseカードがSP版のrarity/set/seriesで汚染される
   （実害26枚: 例 EB04-054 の本来R が OP16ページのSPカードで上書き）。
   第1パス=基本版(_pNなし)のみ採用 → 第2パス=どのシリーズにもbaseが無い番号だけパラレルで補完。 */
/* ★収録弾（sets）: 「そのカードがどの商品に収録されているか」。カード番号の接頭辞≠収録弾（再録があるため）。
   例: 新スタートデッキ ST-31 の中身は ST31-001〜005 の新規5枚 ＋ 他弾からの再録10枚（リーダーは ST21-001 の別イラスト）。
   接頭辞だけで「弾」を出すとデッキビルダーの弾フィルタに ST31〜36 のリーダーも再録札も出せない → 収録弾を正本として記録する。
   キーは _pN/_rN を剥がした base番号（＝カードの同一性。別イラストは base の収録弾を継承する）。 */
const SETCODE = {};
for (let i = 1; i <= 36; i++) SETCODE[550000 + i] = 'ST' + String(i).padStart(2, '0');
for (let i = 1; i <= 16; i++) SETCODE[550100 + i] = 'OP' + String(i).padStart(2, '0');
for (let i = 1; i <= 4; i++) SETCODE[550200 + i] = 'EB' + String(i).padStart(2, '0');
for (let i = 1; i <= 2; i++) SETCODE[550300 + i] = 'PRB' + String(i).padStart(2, '0');
// 550701(ファミリーデッキセット)/550801(限定商品)/550901(プロモ) は独自の弾コードを作らず、カード番号の接頭辞（P 等）をそのまま使う
const baseOf = no => no.replace(/_[pr]\d+$/, '');
const setsByBase = {};

const byNo = {}; const parallels = []; let totalBlocks = 0; const failed = [];
for (const id of SERIES) {
  let html = fetchSeries(id);
  if (!html || html.length < 2000) { cp.execSync('sleep 2'); html = fetchSeries(id); } // 1回だけリトライ
  if (!html || html.length < 2000) { failed.push(id); console.error('skip(取得失敗)', id); continue; }
  const blocks = html.match(/<dl class="modalCol"[\s\S]*?<\/dl>/g) || [];
  totalBlocks += blocks.length;
  let added = 0;
  for (const blk of blocks) {
    const c = parse(blk, id); if (!c) continue;
    const bid = baseOf(c.no);
    (setsByBase[bid] = setsByBase[bid] || new Set()).add(SETCODE[id] || bid.split('-')[0]); // 収録弾（再録・別イラスト・パラレルも全て base に集約）
    const isParallel = /_p\d+$/.test(c.no);
    const base = c.no.replace(/_p\d+$/, ''); c.no = base;
    if (isParallel) { parallels.push(c); continue; }
    if (!byNo[base]) { byNo[base] = c; added++; }
  }
  console.error(`series ${id}: blocks=${blocks.length} 新規=${added} 累計=${Object.keys(byNo).length}`);
  cp.execSync('sleep 0.25');
}
let fromParallel = 0;
for (const c of parallels) if (!byNo[c.no]) { byNo[c.no] = c; fromParallel++; }
if (fromParallel) console.error(`★base版がどこにも無くパラレルから補完した番号: ${fromParallel}件`);
const cards = Object.values(byNo).sort((a, b) => a.no < b.no ? -1 : 1);
for (const c of cards) c.sets = [...(setsByBase[baseOf(c.no)] || [baseOf(c.no).split('-')[0]])].sort();
const body = cards.map(c => '  ' + JSON.stringify(c)).join(',\n');
fs.writeFileSync(OUT, '[\n' + body + '\n]\n');
const byType = {}; for (const c of cards) byType[c.type] = (byType[c.type] || 0) + 1;
const withTrigger = cards.filter(c => c.trigger).length;
console.log(`完了: ブロック${totalBlocks} / ユニーク${cards.length} / 種別 ${JSON.stringify(byType)} / トリガー持ち ${withTrigger}枚 → ${OUT} (${(fs.statSync(OUT).size / 1024 | 0)}KB)`);
if (failed.length) console.log('★取得失敗シリーズ(要再実行): ' + failed.join(', '));

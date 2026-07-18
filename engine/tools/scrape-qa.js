#!/usr/bin/env node
/* tools/scrape-qa.js — 公式ルールQ&Aページのローカルキャッシュ official-qa.json を生成する。
   使い方: node tools/scrape-qa.js
   - カードQ&A全件: qa.php?tab=cardqa&type=1（1リクエストで全件。ページ内に同一リストが2コピーあり、
     1コピー目の qaTit=収録セット名 / 2コピー目の qaTit=カード番号+カード名 → qaNum でマージして両方を得る）
   - ルールFAQ全件: qa.php?tab=faq&type=0（qaTit=カテゴリ名）
   - カード番号は official-full.json のキーと突合し、無い番号は unmapped に回す（新弾の可能性があるため失敗にはしない）
   - 出力: tools/official-qa.json（tools/qa-lookup.js が読む）
   依存: Node.js 18+（global fetch）のみ。 */
const fs = require('fs'), path = require('path');
const OUT = path.resolve(__dirname, 'official-qa.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const BASE = 'https://www.onepiece-cardgame.com/rules/qa.php';
const CARDNO_RE = /(?:OP|EB|ST|PRB)\d{2}-\d{3}|P-\d{3}/g;

async function fetchPage(query) {
  const res = await fetch(BASE + query, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja' },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${BASE}${query}`);
  return res.text();
}

// HTML断片 → 平文（<br>は改行に・タグ除去・エンティティデコード・空白正規化）
function plain(s) {
  return (s || '')
    .replace(/<br[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n')
    .replace(/\n{2,}/g, '\n').trim();
}

// resultItem 1ブロック → { n, titles[], date, q, a }
function parseItems(html) {
  const chunks = html.split('<div class="resultItem">').slice(1);
  const items = [];
  for (const c of chunks) {
    const n = +((c.match(/class="qaNum">Q<span>(\d+)<\/span>/) || [])[1] || 0);
    if (!n) continue;
    const titles = [...c.matchAll(/<dd class="qaTit">([\s\S]*?)<\/dd>/g)].map(m => plain(m[1]));
    const date = plain((c.match(/<dd class="qaDate">([\s\S]*?)<\/dd>/) || [])[1]).replace(/更新$/, '');
    const q = plain((c.match(/<dl class="questions">[\s\S]*?<dt>Q<\/dt>\s*<dd>([\s\S]*?)<\/dd>/) || [])[1]);
    const a = plain((c.match(/<dl class="answer">[\s\S]*?<dt>A<\/dt>\s*<dd>([\s\S]*?)<\/dd>/) || [])[1]);
    items.push({ n, titles, date, q, a });
  }
  return items;
}

(async () => {
  console.error('カードQ&A取得中 …');
  const cardHtml = await fetchPage('?tab=cardqa&type=1');
  await new Promise(r => setTimeout(r, 500));
  console.error('ルールFAQ取得中 …');
  const faqHtml = await fetchPage('?tab=faq&type=0');

  // ── カードQ&A: qaNum でマージ（タイトルはカード番号入り/セット名の2種が別コピーに載る）──
  const byN = new Map();
  for (const it of parseItems(cardHtml)) {
    const g = byN.get(it.n) || { n: it.n, titles: [], date: it.date, q: it.q, a: it.a };
    g.titles.push(...it.titles);
    if (!g.q) g.q = it.q; if (!g.a) g.a = it.a; if (!g.date) g.date = it.date;
    byN.set(it.n, g);
  }
  const official = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'official-full.json'), 'utf8'));
  const known = new Set(official.map(c => c.no));

  const cards = {}; const unmapped = [];
  let mappedQa = 0;
  for (const g of [...byN.values()].sort((a, b) => a.n - b.n)) {
    const nos = [...new Set(g.titles.join(' ').match(CARDNO_RE) || [])];
    const title = g.titles.find(t => CARDNO_RE.test(t) && (CARDNO_RE.lastIndex = 0, true)) || g.titles[0] || '';
    const set = g.titles.find(t => !(t.match(CARDNO_RE))) || '';
    const entry = { n: g.n, date: g.date, title, set, q: g.q, a: g.a };
    const knownNos = nos.filter(no => known.has(no));
    const unknownNos = nos.filter(no => !known.has(no));
    for (const no of knownNos) (cards[no] = cards[no] || []).push(entry);
    if (knownNos.length) mappedQa++;
    if (!nos.length || unknownNos.length) unmapped.push({ ...entry, nos });
  }
  const sortedCards = {};
  for (const no of Object.keys(cards).sort()) sortedCards[no] = cards[no];

  // ── ルールFAQ ──
  const rules = parseItems(faqHtml)
    .map(it => ({ n: it.n, cat: it.titles[0] || '', date: it.date, q: it.q, a: it.a }))
    .sort((a, b) => a.n - b.n);

  const data = {
    fetchedAt: (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date()), // ローカル日付（UTCだと日本時間で1日ずれる）
    cardQaCount: byN.size, ruleQaCount: rules.length,
    cards: sortedCards, unmapped, rules,
  };
  // カード別Q&Aを1行1件で書く（grep しやすさ優先）
  const lines = [];
  lines.push('{');
  lines.push(`  "fetchedAt": ${JSON.stringify(data.fetchedAt)},`);
  lines.push(`  "cardQaCount": ${data.cardQaCount}, "ruleQaCount": ${data.ruleQaCount},`);
  lines.push('  "cards": {');
  const noKeys = Object.keys(sortedCards);
  noKeys.forEach((no, i) => {
    const body = sortedCards[no].map(e => '    ' + JSON.stringify(e)).join(',\n');
    lines.push(`  ${JSON.stringify(no)}: [\n${body}\n  ]${i < noKeys.length - 1 ? ',' : ''}`);
  });
  lines.push('  },');
  lines.push('  "unmapped": [');
  lines.push(unmapped.map(e => '    ' + JSON.stringify(e)).join(',\n'));
  lines.push('  ],');
  lines.push('  "rules": [');
  lines.push(rules.map(e => '    ' + JSON.stringify(e)).join(',\n'));
  lines.push('  ]');
  lines.push('}');
  fs.writeFileSync(OUT, lines.join('\n') + '\n');

  console.log(`完了: カードQ&A ${byN.size}件（カード番号に紐づけ ${mappedQa}件 → ${noKeys.length}カード / unmapped ${unmapped.length}件） / ルールFAQ ${rules.length}件 → ${OUT} (${(fs.statSync(OUT).size / 1024 | 0)}KB)`);
  if (unmapped.length) {
    const noNum = unmapped.filter(e => !e.nos.length).length;
    console.log(`★unmapped 内訳: 番号抽出できず ${noNum}件 / official-full に無い番号あり ${unmapped.length - noNum}件（新弾の可能性）`);
  }
})().catch(e => { console.error('失敗:', e.message); process.exit(1); });

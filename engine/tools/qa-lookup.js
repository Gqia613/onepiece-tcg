#!/usr/bin/env node
/* tools/qa-lookup.js — official-qa.json（公式Q&Aローカルキャッシュ）を引くCLI。
   使い方:
     node tools/qa-lookup.js ST36-005 [OP10-099 …]   # カード別Q&A全文
     node tools/qa-lookup.js --set ST36              # セット内でQ&Aを持つカード一覧+全文
     node tools/qa-lookup.js --search <キーワード>   # カードQ&A+ルールFAQ横断の部分一致検索
     node tools/qa-lookup.js --rules [カテゴリ]      # ルールFAQ表示（カテゴリは部分一致）
     node tools/qa-lookup.js --stats                 # 総数・セット別カバレッジ
   共通: --json で機械可読出力。キャッシュ更新は node tools/scrape-qa.js。 */
const fs = require('fs'), path = require('path');
const QA_PATH = path.resolve(__dirname, 'official-qa.json');
if (!fs.existsSync(QA_PATH)) {
  console.error('official-qa.json がありません。先に node tools/scrape-qa.js を実行してください。');
  process.exit(1);
}
const QA = JSON.parse(fs.readFileSync(QA_PATH, 'utf8'));
let NAME = {};
try { for (const c of JSON.parse(fs.readFileSync(path.resolve(__dirname, 'official-full.json'), 'utf8'))) NAME[c.no] = c.name; } catch (e) { /* 名前解決なしで続行 */ }

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const rest = args.filter(a => a !== '--json');

const fmtEntry = (e, indent = '  ') =>
  `${indent}Q${e.n}（${e.date}）\n${indent}Q: ${e.q.replace(/\n/g, '\n' + indent + '   ')}\n${indent}A: ${e.a.replace(/\n/g, '\n' + indent + '   ')}`;
const cardHeader = no => `■ ${no} ${NAME[no] || ''}`.trim();
const out = obj => console.log(JSON.stringify(obj, null, 2));

// セットコード: 番号の "-" より前（OP01/ST36/EB01/PRB01/P）
const setOf = no => no.slice(0, no.indexOf('-'));

if (rest[0] === '--stats') {
  const bySet = {};
  for (const [no, list] of Object.entries(QA.cards)) {
    const s = setOf(no);
    const b = bySet[s] = bySet[s] || { cards: 0, qa: 0 };
    b.cards++; b.qa += list.length;
  }
  const stats = {
    fetchedAt: QA.fetchedAt,
    cardQaCount: QA.cardQaCount, ruleQaCount: QA.ruleQaCount,
    cardsWithQa: Object.keys(QA.cards).length, unmapped: QA.unmapped.length,
    bySet: Object.fromEntries(Object.entries(bySet).sort()),
  };
  if (asJson) { out(stats); process.exit(0); }
  console.log(`取得日: ${stats.fetchedAt}`);
  console.log(`カードQ&A: ${stats.cardQaCount}件（Q&Aを持つカード ${stats.cardsWithQa}枚 / unmapped ${stats.unmapped}件） / ルールFAQ: ${stats.ruleQaCount}件`);
  console.log('セット別（カード数 / Q&A延べ件数）:');
  for (const [s, b] of Object.entries(stats.bySet)) console.log(`  ${s.padEnd(6)} ${String(b.cards).padStart(3)}枚 / ${String(b.qa).padStart(4)}件`);
  process.exit(0);
}

if (rest[0] === '--rules') {
  const cat = rest[1];
  const list = QA.rules.filter(r => !cat || r.cat.includes(cat));
  if (asJson) { out(list); process.exit(0); }
  if (!list.length) { console.log(`ルールFAQなし${cat ? `（カテゴリ「${cat}」）` : ''}`); process.exit(0); }
  let cur = '';
  for (const r of list) {
    if (r.cat !== cur) { cur = r.cat; console.log(`■ ${cur}`); }
    console.log(fmtEntry(r));
  }
  process.exit(0);
}

if (rest[0] === '--search') {
  const kw = rest[1];
  if (!kw) { console.error('使い方: node tools/qa-lookup.js --search <キーワード>'); process.exit(1); }
  const hit = e => e.q.includes(kw) || e.a.includes(kw) || (e.title || '').includes(kw) || (e.cat || '').includes(kw);
  const cardHits = []; const seen = new Set();
  for (const [no, list] of Object.entries(QA.cards)) for (const e of list) {
    if (hit(e) && !seen.has(e.n)) { seen.add(e.n); cardHits.push({ no, ...e }); }
  }
  const ruleHits = QA.rules.filter(hit);
  if (asJson) { out({ cards: cardHits, rules: ruleHits }); process.exit(0); }
  console.log(`「${kw}」: カードQ&A ${cardHits.length}件 / ルールFAQ ${ruleHits.length}件`);
  for (const e of cardHits) { console.log(cardHeader(e.no)); console.log(fmtEntry(e)); }
  for (const r of ruleHits) { console.log(`■ ルールFAQ: ${r.cat}`); console.log(fmtEntry(r)); }
  process.exit(0);
}

if (rest[0] === '--set') {
  const set = (rest[1] || '').toUpperCase();
  if (!set) { console.error('使い方: node tools/qa-lookup.js --set <セットコード（例 ST36）>'); process.exit(1); }
  const nos = Object.keys(QA.cards).filter(no => setOf(no) === set).sort();
  if (asJson) { out(Object.fromEntries(nos.map(no => [no, QA.cards[no]]))); process.exit(0); }
  if (!nos.length) { console.log(`${set}: Q&Aを持つカードなし`); process.exit(0); }
  console.log(`${set}: Q&Aを持つカード ${nos.length}枚`);
  for (const no of nos) console.log(`  ${no} ${NAME[no] || ''} … ${QA.cards[no].length}件`);
  for (const no of nos) { console.log(cardHeader(no)); for (const e of QA.cards[no]) console.log(fmtEntry(e)); }
  process.exit(0);
}

// 既定: カード番号列
if (!rest.length) {
  console.error('使い方: node tools/qa-lookup.js <カード番号…> | --set <弾> | --search <語> | --rules [カテゴリ] | --stats（--json 併用可）');
  process.exit(1);
}
if (asJson) { out(Object.fromEntries(rest.map(no => [no.toUpperCase(), QA.cards[no.toUpperCase()] || []]))); process.exit(0); }
for (const raw of rest) {
  const no = raw.toUpperCase();
  const list = QA.cards[no] || [];
  console.log(cardHeader(no));
  if (!list.length) { console.log('  Q&Aなし'); continue; }
  for (const e of list) console.log(fmtEntry(e));
}

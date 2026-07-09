#!/usr/bin/env node
/* tools/compare-dumps.js — measure-matchup の OPCG_DUMP 出力2つを同一seedで直接比較（flip符号検定）。E38。
   使い方: OPCG_AGENT=puct  OPCG_HERO=teach OPCG_VILLAIN=teach OPCG_DUMP=/tmp/a.json node tools/measure-matchup.js
           OPCG_AGENT=bpuct OPCG_HERO=teach OPCG_VILLAIN=teach OPCG_DUMP=/tmp/b.json node tools/measure-matchup.js
           node tools/compare-dumps.js /tmp/a.json /tmp/b.json [arm]
   arm: 比較する列（既定 mh = AGENTアーム。h=heuristicアーム/ml=学習アーム）。
   なぜ: puct系の「上乗せ」改良（bpuct/puct3/planpuct等）は、各々の対hのpt差を読むより
   両dumpの同一seed直接flip（Bが勝ちAが負け=改善）の符号検定の方が検出力が高い。
   複数dumpの合算にも対応: node tools/compare-dumps.js A1.json,A2.json B1.json,B2.json（対応順にペア比較して合算）。 */
const fs = require('fs');

function signTestP(imp, reg) {
  const n = imp + reg; if (n === 0) return 1;
  const k = Math.min(imp, reg);
  let p = 0; for (let i = 0; i <= k; i++) { const lg = x => { let s = 0; for (let j = 2; j <= x; j++) s += Math.log(j); return s; }; const c = lg(n) - lg(i) - lg(n - i); p += Math.exp(c + n * Math.log(0.5)); }
  return Math.min(1, 2 * p); // 両側
}

const [fileA, fileB, arm = 'mh'] = process.argv.slice(2);
if (!fileA || !fileB) { console.error('usage: node tools/compare-dumps.js <dumpA.json[,dumpA2.json...]> <dumpB.json[,...]> [h|mh|ml]'); process.exit(1); }
const listA = fileA.split(','), listB = fileB.split(',');
if (listA.length !== listB.length) { console.error('✗ A/B のdump数が一致しません'); process.exit(1); }

let tImp = 0, tReg = 0, tN = 0, tAw = 0, tBw = 0;
for (let f = 0; f < listA.length; f++) {
  const A = JSON.parse(fs.readFileSync(listA[f], 'utf8'));
  const B = JSON.parse(fs.readFileSync(listB[f], 'utf8'));
  for (const pa of A.pairs || []) {
    const pb = (B.pairs || []).find(x => x.hero === pa.hero && x.villain === pa.villain);
    if (!pb) { console.error('  (skip) ' + pa.hero + ' vs ' + pa.villain + ': B側に同一ペアなし'); continue; }
    const bBySeed = new Map(pb.rows.map(r => [r.seed, r]));
    let imp = 0, reg = 0, n = 0, aW = 0, bW = 0;
    for (const ra of pa.rows) {
      const rb = bBySeed.get(ra.seed); if (!rb || ra[arm] == null || rb[arm] == null) continue;
      n++; if (ra[arm]) aW++; if (rb[arm]) bW++;
      if (rb[arm] && !ra[arm]) imp++; else if (!rb[arm] && ra[arm]) reg++;   // B勝ちA負け=改善(B視点)
    }
    const p = signTestP(imp, reg), eff = n ? (bW - aW) / n * 100 : 0;
    console.log('  ' + pa.hero + ' vs ' + pa.villain + ' (共通seed n=' + n + ', arm=' + arm + '): A[' + A.agent + ']=' + (n ? (100 * aW / n).toFixed(1) : '-') + '%  B[' + B.agent + ']=' + (n ? (100 * bW / n).toFixed(1) : '-') + '%'
      + '  B-A ' + (eff >= 0 ? '+' : '') + eff.toFixed(1) + 'pt  改善' + imp + '/退行' + reg + ' p=' + p.toFixed(3) + (p < 0.05 ? '★' : ''));
    tImp += imp; tReg += reg; tN += n; tAw += aW; tBw += bW;
  }
}
if (tN) {
  const p = signTestP(tImp, tReg), eff = (tBw - tAw) / tN * 100;
  console.log('  ── 合算 (n=' + tN + '): B-A ' + (eff >= 0 ? '+' : '') + eff.toFixed(1) + 'pt  改善' + tImp + '/退行' + tReg + '  符号検定 p=' + p.toFixed(3) + (p < 0.05 ? ' ★有意' : ''));
}

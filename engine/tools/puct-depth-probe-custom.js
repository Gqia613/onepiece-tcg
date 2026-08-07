#!/usr/bin/env node
/* tools/puct-depth-probe-custom.js — puct-depth-probe.js のカスタムデッキ版。
   プリセットに無いリーダー（実対戦リプレイから抽出した実デッキ）で「探索を深くすると強くなるか」を測る。
   デッキは tools/probe-decks.json（[{id,name,leader,list}] 形式・G.customDecks に注入）。
   使い方: OPCG_HERO=c_OP13-001 OPCG_VILLAIN=c_OP13-001 OPCG_N=40 node tools/puct-depth-probe-custom.js
           PUCT_DET=6 PUCT_LOOK=2 PUCT_WIDTH=6 / OPCG_SEED0 は本家と同じ。
   ★測定ロジック・ペア比較・符号検定は本家 puct-depth-probe.js と同一（同一seedで h/base/strong を打ち比べ）。 */
const fs = require('fs');
const path = require('path');
const { runHarness } = require('./../tests/_load-app');
const HERO = process.env.OPCG_HERO || 'c_OP13-001', VILLAIN = process.env.OPCG_VILLAIN || HERO;
const N = +(process.env.OPCG_N || 40), SEED0 = +(process.env.OPCG_SEED0 || 800000);
const DET = +(process.env.PUCT_DET || 6), LOOK = +(process.env.PUCT_LOOK || 2), WIDTH = +(process.env.PUCT_WIDTH || 6);
const DECKS_JSON = fs.readFileSync(path.join(__dirname, 'probe-decks.json'), 'utf8');

function signP(a, b) { const n = a + b; if (!n) return 1; const k = Math.min(a, b); const lg = x => { let s = 0; for (let j = 2; j <= x; j++) s += Math.log(j); return s; }; let p = 0; for (let i = 0; i <= k; i++) p += Math.exp(lg(n) - lg(i) - lg(n - i) + n * Math.log(0.5)); return Math.min(1, 2 * p); }

const harness = String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
G.customDecks = ` + DECKS_JSON + `;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };
const HERO = ` + JSON.stringify(HERO) + `, VILLAIN = ` + JSON.stringify(VILLAIN) + `, N = ` + N + `, SEED0 = ` + SEED0 + `;
const DET = ` + DET + `, LOOK = ` + LOOK + `, WIDTH = ` + WIDTH + `;
async function pg(seed, agent, strong) {
  const cds = G.customDecks;
  G._puctDet = strong ? DET : 3; G._puctLook = strong ? LOOK : 1; G._puctWidth = strong ? WIDTH : 5;
  G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
  G.customDecks = cds;
  startGame(HERO, VILLAIN);
  G.players.me.isCPU = true; G.players.me.agent = agent; G.players.cpu.agent = 'heuristic';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));
  G._puctDet = null; G._puctLook = null; G._puctWidth = null;
  return G.winner === 'me';
}
(async () => {
  let h = 0, pb = 0, ps = 0, impB = 0, regB = 0, impS = 0, regS = 0, impSB = 0, regSB = 0;
  for (let i = 0; i < N; i++) {
    const seed = SEED0 + i;
    const wh = await pg(seed, 'heuristic', false);
    const wb = await pg(seed, 'puct', false);
    const ws = await pg(seed, 'puct', true);
    if (wh) h++; if (wb) pb++; if (ws) ps++;
    if (wb && !wh) impB++; else if (!wb && wh) regB++;
    if (ws && !wh) impS++; else if (!ws && wh) regS++;
    if (ws && !wb) impSB++; else if (!ws && wb) regSB++;
  }
  console.log('RES ' + JSON.stringify({ h, pb, ps, impB, regB, impS, regS, impSB, regSB }));
  process.exit(0);
})();
`;

let out;
try { out = runHarness('puct-depth-custom', harness, { timeout: 590000 }); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
const m = out.match(/RES (\{.*\})/); if (!m) { console.error('結果なし\n' + out); process.exit(1); }
const r = JSON.parse(m[1]);
const pct = x => (100 * x / N).toFixed(1) + '%';
console.log('▶ puct 深さプローブ(custom) ' + HERO + ' vs ' + VILLAIN + ' (N=' + N + ', strong=det' + DET + '/look' + LOOK + '/w' + WIDTH + ')');
console.log('  heuristic   = ' + pct(r.h));
console.log('  puct-base   = ' + pct(r.pb) + '  (対h ' + ((r.pb - r.h) / N * 100 >= 0 ? '+' : '') + ((r.pb - r.h) / N * 100).toFixed(1) + 'pt 改善' + r.impB + '/退行' + r.regB + ' p=' + signP(r.impB, r.regB).toFixed(3) + ')');
console.log('  puct-strong = ' + pct(r.ps) + '  (対h ' + ((r.ps - r.h) / N * 100 >= 0 ? '+' : '') + ((r.ps - r.h) / N * 100).toFixed(1) + 'pt 改善' + r.impS + '/退行' + r.regS + ' p=' + signP(r.impS, r.regS).toFixed(3) + ')');
console.log('  strong vs base: ' + ((r.impSB - r.regSB) / N * 100 >= 0 ? '+' : '') + ((r.impSB - r.regSB) / N * 100).toFixed(1) + 'pt  改善' + r.impSB + '/退行' + r.regSB + ' p=' + signP(r.impSB, r.regSB).toFixed(3));

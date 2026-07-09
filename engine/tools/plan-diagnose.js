#!/usr/bin/env node
/* tools/plan-diagnose.js — DECK_PLANS(サーチ先最適化・E39)の「発火頻度」事前診断。E38。
   使い方: node tools/plan-diagnose.js              （既定: lucy,ace,teach,yamato,enel ミラー各N=50）
           OPCG_DECKS='lucy,teach' OPCG_N=100 node tools/plan-diagnose.js
   仕組み: heuristicミラーを決定的に回し、G._searchDiag フック(20-targeting-fx.js)で
     CPUのサーチ解決（search/searchDeck op）を記録。リーダー別に
     (i) サーチ解決回数/局・(ii) 候補数平均・(iii) plan選択がbyPow選択と違う率(DECK_PLANSと
     planBestPick が定義済みの場合のみ=E39以降) を集計する。
   ゲート(E39・mulligan「発火せず」の教訓): 発火<1.5回/局 or 差分率<15% のリーダーは
     「死にレバー」として measure-matchup の測定対象から除外する。 */
const { runHarness } = require('./../tests/_load-app');
const DECKS = (process.env.OPCG_DECKS || 'lucy,ace,teach,yamato,enel').split(',').map(s => s.trim()).filter(Boolean);
const N = +(process.env.OPCG_N || 50);

const harness = String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };
const _DKS = ` + JSON.stringify(DECKS) + `, N = ` + N + `;
const EV = [];   // {deck, gi, lk, opk, nc, pickNo, planNo, diff, planDef}
let CUR = { deck: '', gi: -1 };
function installDiag() {
  G._searchDiag = function (side, cands, pick, op) {
    if (G._sim || !cands || !cands.length) return;
    const lk = leaderKeyOf(side);
    const DP = (typeof window !== 'undefined' && window.DECK_PLANS) || null;   // window直参照（harnessのwindowはglobalThisでない）
    let planNo = null, diff = 0, planDef = 0;
    if (typeof planBestPick === 'function' && DP && DP.byLeader && DP.byLeader[lk]) {
      planDef = 1;
      try { const bp = planBestPick(side, cands, DP.byLeader[lk]); if (bp) { planNo = bp.base.no; if (!pick || bp.uid !== pick.uid) diff = 1; } } catch (e) { }
    }
    EV.push({ deck: CUR.deck, gi: CUR.gi, lk, opk: op && op.op, nc: cands.length, pickNo: pick && pick.base.no, planNo, diff, planDef });
  };
}
async function playGame(seed, deck, gi) {
  CUR = { deck, gi };
  G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
  installDiag();
  startGame(deck, deck); G.players.me.isCPU = true; G.players.me.agent = 'heuristic'; G.players.cpu.agent = 'heuristic';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));   // ドレイン（決定的）
}
(async () => {
  for (const deck of _DKS) for (let i = 0; i < N; i++) await playGame(800000 + i, deck, i);
  for (const deck of _DKS) {
    const evs = EV.filter(e => e.deck === deck);
    const perGame = evs.length / N / 2;   // ミラー=両サイド同リーダーなので1プレイヤー当たり
    const nc = evs.length ? evs.reduce((s, e) => s + e.nc, 0) / evs.length : 0;
    const defd = evs.some(e => e.planDef);
    let line = '■ ' + deck + ': サーチ解決 ' + perGame.toFixed(2) + '回/局/側 (計' + evs.length + '件/' + N + '局)  候補数平均=' + nc.toFixed(1);
    if (defd) {
      const diffs = evs.filter(e => e.diff).length, rate = evs.length ? 100 * diffs / evs.length : 0;
      line += '  plan差分率=' + rate.toFixed(1) + '% (' + diffs + '/' + evs.length + ')';
      line += (perGame < 1.5 || rate < 15) ? '  ← 死にレバー候補(発火<1.5/局 or 差分<15%)' : '  ← 測定対象OK';
    } else line += '  (DECK_PLANS未定義=発火頻度のみ)';
    console.log(line);
    // op種別・選ばれた札の内訳（上位のみ）: プラン設計の材料
    const byOp = {}; for (const e of evs) byOp[e.opk] = (byOp[e.opk] || 0) + 1;
    console.log('   op内訳: ' + JSON.stringify(byOp));
    const byPick = {}; for (const e of evs) if (e.pickNo) byPick[e.pickNo] = (byPick[e.pickNo] || 0) + 1;
    const top = Object.entries(byPick).sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log('   byPow選択の上位: ' + top.map(([no, c]) => no + '×' + c).join(' '));
  }
  process.exit(0);
})();
`;

try { process.stdout.write(runHarness('plan-diagnose', harness, { timeout: 590000 })); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }

#!/usr/bin/env node
/* tools/analyze-heuristic.js — heuristicの「負け局」を分析して改良仮説を出す（リプレイ分析の自動化）。
   使い方: node tools/analyze-heuristic.js              （既定: teach/enel ミラー各N=200）
           OPCG_DECKS='teach,enel,lucy' OPCG_N=300 node tools/analyze-heuristic.js
   仕組み: heuristicミラー自己対戦を決定的に回し、各ターン終了時の状態を記録。
     リーダー別に「勝った側 vs 負けた側」で各指標の平均を比較し、差が大きい＝系統的な弱点＝改良仮説の種。
   指標: hand=手札残/donLeft=未使用アクティブドン/board=盤面数/atk=そのターンの攻撃数/
        missPlay=出せるCHARが手札にあるのに出さなかった率/life・oppLife。 */
const { runHarness } = require('./../tests/_load-app');
const DECKS = (process.env.OPCG_DECKS || 'teach,enel').split(',').map(s => s.trim()).filter(Boolean);
const N = +(process.env.OPCG_N || 200);

const harness = String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };
const _DKS = ` + JSON.stringify(DECKS) + `, N = ` + N + `;
const ROWS = [], WIN = {}; let GI = -1; const atk = { me: 0, cpu: 0 };
const _da = declareAttack; declareAttack = async function (a, t) { if (!G._sim && G.active) atk[G.active] = (atk[G.active] || 0) + 1; return _da(a, t); };
// 各ターン終了時(=その側の手番完了時)に状態を記録
const _et = endTurn; endTurn = async function (side) {
  if (!G._sim && G.players[side] && G.players[side].leader) {
    const P = G.players[side], D = G.players[opp(side)];
    const canPlay = P.hand.some(c => c.base.type === 'CHAR' && effCost(side, c) <= P.don.active && P.chars.length < 5);
    ROWS.push({ gi: GI, lk: leaderKeyOf(side), side, turn: P.turnsTaken, hand: P.hand.length, donLeft: P.don.active,
      board: P.chars.length, atk: atk[side] || 0, missPlay: canPlay ? 1 : 0, life: P.life.length, oppLife: D.life.length });
    atk[side] = 0;
  }
  return _et(side);
};
async function playGame(seed, deck) {
  GI++; G.players = {}; G.winner = null; G.inGame = false; seedRng(seed);
  startGame(deck, deck); G.players.me.isCPU = true; G.players.me.agent = 'heuristic'; G.players.cpu.agent = 'heuristic';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));   // ドレイン（決定的）
  WIN[GI] = G.winner;
}
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
(async () => {
  for (const deck of _DKS) for (let i = 0; i < N; i++) await playGame(700000 + i, deck);
  const keys = ['hand', 'donLeft', 'board', 'atk', 'missPlay'];
  for (const lk of [...new Set(ROWS.map(r => r.lk))]) {
    const rows = ROWS.filter(r => r.lk === lk);
    const won = rows.filter(r => WIN[r.gi] === r.side), lost = rows.filter(r => WIN[r.gi] && WIN[r.gi] !== r.side);
    console.log('■ ' + lk + ' （勝側ターン数=' + won.length + ' / 負側=' + lost.length + '）');
    for (const k of keys) {
      const w = mean(won.map(r => r[k])), l = mean(lost.map(r => r[k])), d = l - w;
      const flag = Math.abs(d) >= 0.15 ? (k === 'hand' || k === 'donLeft' || k === 'missPlay' ? (d > 0 ? '  ← 負側が多い(弱点候補)' : '') : (d < 0 ? '  ← 負側が少ない' : '')) : '';
      console.log('   ' + k.padEnd(9) + ' 勝=' + w.toFixed(2) + ' 負=' + l.toFixed(2) + ' 差(負-勝)=' + (d >= 0 ? '+' : '') + d.toFixed(2) + flag);
    }
    // 序盤(turn<=3)の missPlay/donLeft（序盤の出し損ねは特に痛い）
    const eW = won.filter(r => r.turn <= 3), eL = lost.filter(r => r.turn <= 3);
    console.log('   [序盤T<=3] missPlay 勝=' + mean(eW.map(r => r.missPlay)).toFixed(2) + ' 負=' + mean(eL.map(r => r.missPlay)).toFixed(2)
      + ' / donLeft 勝=' + mean(eW.map(r => r.donLeft)).toFixed(2) + ' 負=' + mean(eL.map(r => r.donLeft)).toFixed(2));
  }
  process.exit(0);
})();
`;

try { process.stdout.write(runHarness('analyze', harness, { timeout: 590000 })); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }

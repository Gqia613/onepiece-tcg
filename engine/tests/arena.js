#!/usr/bin/env node
/* tests/arena.js — エージェント対戦アリーナ（強さ測定の土台）。
   使い方: node tests/arena.js
   2つのエージェント（既定: heuristic / random）を同一デッキ(ミラー)でN戦させ、勝率とEloを出力する。
   - 両サイドを isCPU=true + P.agent でエージェント駆動にする（効果解決は isCPU 経路で自動）。
   - 席(me/cpu)を1戦ごとに入れ替え、先攻・席バイアスを相殺。
   - seed を固定するので結果は再現可能。
   測定系の健全性チェック: heuristic は random に圧勝（>=75%）するはず。h-vs-h は ~50%。
   L2: 決定化MCTS(mcts) vs heuristic も測る（同一seed帯で h-vs-h 基準を引いた差＝実効果。実測 +6〜7pt）。
   ※mctsは先読みで低速。env OPCG_MCTS=0 でスキップ、OPCG_MCTS_N で戦数調整。 */
const { runHarness } = require('./_load-app');

const harness = String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
// 両サイド isCPU のため、ゲーム中の showPrompt はマリガンのみ。両者を同一方針(cpuShouldMulligan)で統一。
showPrompt = function (cfg) {
  const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v);
};
humanPick = function (c) { return Promise.resolve(c[0] || null); };

// 1ゲーム実行: 席me=agA, 席cpu=agB。勝者の席('me'|'cpu'|null)を返す。
async function playGame(seed, deckA, deckB, agA, agB) {
  G.players = {}; G.winner = null; G.inGame = false;
  seedRng(seed);
  startGame(deckA, deckB);                  // 同期前半でプレイヤー生成→マリガンawaitで一時停止
  G.players.me.isCPU = true; G.players.me.agent = agA;   // ここで両サイドをエージェント駆動に
  G.players.cpu.agent = agB;
  let it = 0;
  while (!(G.winner && !G._sim) && it < 800000) { await new Promise(r => setImmediate(r)); it++; }
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));  // ★保留タスクを消化（次局に漏らさない＝再現性）
  return G.winner;
}

// N戦してagA視点の勝敗を集計。席は1戦ごとに入替。seed0で帯を固定（公平なペア比較用）。
async function arena(agA, agB, n, deck, seed0) {
  seed0 = seed0 || 1000;
  let aWins = 0, bWins = 0, none = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;                // 奇数戦は席を入替
    const meAgent = swap ? agB : agA, cpuAgent = swap ? agA : agB;
    const w = await playGame(seed0 + i, deck, deck, meAgent, cpuAgent);
    const meIsA = !swap;
    if (w === 'me') (meIsA ? aWins++ : bWins++);
    else if (w === 'cpu') (meIsA ? bWins++ : aWins++);
    else none++;
  }
  return { aWins, bWins, none };
}

function elo(p) { if (p <= 0) return -800; if (p >= 1) return 800; return Math.round(-400 * Math.log10(1 / p - 1)); }
function report(label, r) {
  const dec = r.aWins + r.bWins;
  const p = dec ? r.aWins / dec : 0.5;
  console.log('  ' + label + ': A=' + r.aWins + ' B=' + r.bWins + (r.none ? ' 引分/未決=' + r.none : '')
    + '  勝率A=' + (p * 100).toFixed(1) + '%  ΔElo(A-B)=' + (p > 0 && p < 1 ? (elo(p) > 0 ? '+' : '') + elo(p) : '±∞'));
  return p;
}

(async () => {
  const DECK = 'lucy';                       // ミラーで席・デッキ差を排除し、純粋にエージェントの強さを比較
  console.log('▶ アリーナ（ミラー: ' + DECK + '）');
  const N = 40;
  const pHR = report('heuristic vs random  ', await arena('heuristic', 'random', N, DECK));
  const pHH = report('heuristic vs heuristic', await arena('heuristic', 'heuristic', 20, DECK));

  // 健全性: heuristic は random に明確に勝ち越す。h-vs-h は概ね互角。
  const ok = pHR >= 0.75 && pHH >= 0.30 && pHH <= 0.70;
  console.log(ok ? '  ✓ アリーナ健全（測定系が機能・heuristic>>random・ミラーは互角）'
                 : '  ✗ アリーナ異常（勝率が想定外。seam/測定を要確認）');

  // L2: 決定化MCTS vs heuristic。位置バイアスを相殺するため「同一seed帯」で h-vs-h 基準も測り、差(pt)で実効果を見る。
  // ★mctsは1戦が重い(先読み)。env OPCG_MCTS_N で戦数を調整可（既定12）。スキップは OPCG_MCTS=0。
  if (String(process.env.OPCG_MCTS || '1') !== '0') {
    const NM = +(process.env.OPCG_MCTS_N || 12), SEED = 5000;
    console.log('▶ L2 MCTS（同一seed帯で公平比較, N=' + NM + '・先読みのため低速）');
    const base = report('heuristic vs heuristic', await arena('heuristic', 'heuristic', NM, DECK, SEED));
    const pmc = report('mcts vs heuristic     ', await arena('mcts', 'heuristic', NM, DECK, SEED));
    const gain = (pmc - base) * 100;
    console.log('  → MCTSの実効果: ' + (gain >= 0 ? '+' : '') + gain.toFixed(1) + 'pt（>0で位置バイアス超。安定値は手作りeval+6.7pt／N=30はノイズ±9%大きめ）');
  }
  process.exit(ok ? 0 : 1);
})();
`;

try {
  process.stdout.write(runHarness('arena', harness, { timeout: 590000 }));
} catch (e) {
  process.stdout.write((e.stdout || '') + (e.stderr || ''));
  process.exit(1);
}

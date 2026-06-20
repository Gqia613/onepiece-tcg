#!/usr/bin/env node
/* tools/selfplay-train.js — L3: 自己対戦データ生成 → 盤面評価を【リーダー別】にロジスティック回帰で学習 → src/ai-weights.js 生成。
   使い方: node tools/selfplay-train.js              （既定1800局・6リーダー総当たり）
           OPCG_GAMES=3600 node tools/selfplay-train.js
   ※OPCG_MCTS_GAMES=N で mcts自己対戦局を追加できる（DAgger実験用）。ただし高速設定のmcts局は逆効果だった（既定0・docs/ai-design.md §4.2）。
   仕組み:
     1) 6リーダーを総当たりで対戦（ミラー固定でなく「対フィールド」）。各ターン境界で両者の evalFeatures(side) を記録。
     2) 各サンプルを「そのsideのリーダー」でバケツ分けし、勝敗(1/0)ラベルを付与。
     3) リーダーごとにロジスティック回帰を学習（標準化＋全バッチGD）。全体に default モデルも学習（未知リーダーのフォールバック）。
     4) window.AI_WEIGHTS = { features, leaderKeys, byLeader:{lucy:{w,b},...}, default:{w,b}, meta } を src/ai-weights.js へ。
   ★ evalFeatures/leaderKeyOf は src/70-ai.js と同一（学習と推論で一致が前提）。特徴量を変えたら再学習する。
   ★ リーダー別＝「リーダーごとに盤面の価値が違う」を表現。相手リーダーone-hotで対面（マッチアップ）にも条件付け。 */
const fs = require('fs'), path = require('path');
const { runHarness, ROOT } = require('./../tests/_load-app');

const GAMES = +(process.env.OPCG_GAMES || 1800);
const MCTS_GAMES = +(process.env.OPCG_MCTS_GAMES || 0); // >0 で mcts自己対戦局(on-distribution補正)を追加（高速設定・遅いので少なめに）
// 対戦に使うデッキ(=リーダー)プール。既定6リーダー総当たり。OPCG_DECKS='teach,enel' で特定マッチアップに絞れる。
const DECKS_POOL = (process.env.OPCG_DECKS || 'lucy,ace,nami,hancock,teach,enel').split(',').map(s => s.trim()).filter(Boolean);

const harness = String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };

const GAMES = ` + GAMES + `, MCTS_GAMES = ` + MCTS_GAMES + `;
const LEADERS = ` + JSON.stringify(DECKS_POOL) + `; // 対戦デッキid（プール内で総当たり。OPCG_DECKSで限定可）
const SAMP = [];   // {f:[...特徴量], lk:リーダーキー, side, gi}
const WIN = {};
let GI = -1;
const _bt = beginTurn;
beginTurn = async function (side) {
  if (!G._sim && G.players.me && G.players.cpu && G.players.me.leader && G.players.cpu.leader) {
    SAMP.push({ f: evalFeatures('me'), lk: leaderKeyOf('me'), side: 'me', gi: GI });
    SAMP.push({ f: evalFeatures('cpu'), lk: leaderKeyOf('cpu'), side: 'cpu', gi: GI });
  }
  return _bt(side);
};
async function playGame(seed, dMe, dCpu, agentMe) {
  GI++; G.players = {}; G.winner = null; G.inGame = false;
  seedRng(seed);
  startGame(dMe, dCpu);
  G.players.me.isCPU = true; G.players.me.agent = agentMe || 'heuristic'; G.players.cpu.agent = 'heuristic';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));  // ★保留タスクを消化（次局に漏らさない＝クリーンな学習データ）
  WIN[GI] = G.winner;
}

function train(X, y, epochs, lr, l2) {
  const n = X.length, d = X[0].length;
  const mean = new Array(d).fill(0), std = new Array(d).fill(0);
  for (const r of X) for (let j = 0; j < d; j++) mean[j] += r[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  for (const r of X) for (let j = 0; j < d; j++) { const dv = r[j] - mean[j]; std[j] += dv * dv; }
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n) || 1;
  const Xs = X.map(r => r.map((v, j) => (v - mean[j]) / std[j]));
  let w = new Array(d).fill(0), b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < d; j++) z += w[j] * Xs[i][j];
      const p = 1 / (1 + Math.exp(-z)); const err = p - y[i];
      gb += err; for (let j = 0; j < d; j++) gw[j] += err * Xs[i][j];
    }
    b -= lr * (gb / n);
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
  }
  const wr = new Array(d); let br = b;
  for (let j = 0; j < d; j++) { wr[j] = w[j] / std[j]; br -= w[j] * mean[j] / std[j]; }
  return { w: wr, b: br };
}
function evalAcc(X, y, w, b) {
  let ok = 0; for (let i = 0; i < X.length; i++) { let z = b; for (let j = 0; j < w.length; j++) z += w[j] * X[i][j]; if (((1 / (1 + Math.exp(-z))) >= 0.5 ? 1 : 0) === y[i]) ok++; }
  return ok / X.length;
}
// バケツ samples→(X,y) 化＋8:2分割で学習し {w,b,n,valAcc,base} を返す
function fit(samples) {
  const X = [], y = [];
  for (const s of samples) { const w = WIN[s.gi]; if (w !== 'me' && w !== 'cpu') continue; X.push(s.f); y.push(w === s.side ? 1 : 0); }
  if (X.length < 400) return null;
  const idx = X.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = (i * 1103515245 + 12345 >>> 0) % (i + 1);[idx[i], idx[j]] = [idx[j], idx[i]]; }
  const cut = Math.floor(idx.length * 0.8), Xtr = [], ytr = [], Xva = [], yva = [];
  idx.forEach((k, r) => { (r < cut ? Xtr : Xva).push(X[k]); (r < cut ? ytr : yva).push(y[k]); });
  const m = train(Xtr, ytr, 400, 0.5, 1e-4);
  return { w: m.w.map(v => +v.toFixed(5)), b: +m.b.toFixed(5), n: X.length, valAcc: +evalAcc(Xva, yva, m.w, m.b).toFixed(4), base: +(yva.reduce((a, v) => a + v, 0) / yva.length).toFixed(3) };
}

(async () => {
  // 6×6 の順序対を総当たり（i で全マッチアップを巡回）— heuristic自己対戦（広く速い）
  const NL = LEADERS.length;
  for (let i = 0; i < GAMES; i++) await playGame(200000 + i, LEADERS[i % NL], LEADERS[(i / NL | 0) % NL]);
  // 追加: mcts自己対戦局（on-distribution補正）。me=mcts(現evalで先読み・高速設定)で全リーダーを巡回。遅いので少数。
  if (MCTS_GAMES > 0) {
    G._mctsRollouts = 3; G._mctsDepth = 2;
    for (let i = 0; i < MCTS_GAMES; i++) await playGame(300000 + i, LEADERS[i % NL], LEADERS[(i * (NL > 1 ? NL - 1 : 1) + 1) % NL], 'mcts');
    G._mctsRollouts = null; G._mctsDepth = null;
    console.log('mcts局 ' + MCTS_GAMES + ' 追加（高速設定 rollouts=3/depth=2）');
  }
  const byLeader = {}, report = [];
  const keys = [...new Set(SAMP.map(s => s.lk))].filter(Boolean);
  for (const k of keys) { const r = fit(SAMP.filter(s => s.lk === k)); if (r) { byLeader[k] = { w: r.w, b: r.b }; report.push(k + '(n=' + r.n + ',acc=' + r.valAcc + ')'); } }
  const dft = fit(SAMP); const def = dft ? { w: dft.w, b: dft.b } : null;
  const out = { features: EVAL_FEATURES, leaderKeys: LEADER_KEYS, byLeader, default: def,
    meta: { games: GAMES, samples: SAMP.length, perLeader: report, defaultAcc: dft ? dft.valAcc : null } };
  console.log('learned leaders: ' + report.join(' '));
  console.log('default acc=' + (dft ? dft.valAcc : 'n/a') + ' (多数派' + (dft ? dft.base : '-') + ')');
  console.log('__WEIGHTS__' + JSON.stringify(out));
  process.exit(0);
})();
`;

let stdout;
try { stdout = runHarness('selfplay', harness, { timeout: 590000 }); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
process.stdout.write(stdout.split('__WEIGHTS__')[0]);

const m = stdout.match(/__WEIGHTS__(\{.*\})/);
if (!m) { console.error('✗ 学習結果(__WEIGHTS__)が取得できませんでした'); process.exit(1); }
const weights = JSON.parse(m[1]);
const file = `/* src/ai-weights.js — L3: 自己対戦で学習した【リーダー別】盤面評価の重み。tools/selfplay-train.js が自動生成。手で編集しない。
   学習: ${weights.meta.games}局(6リーダー対フィールド) / ${weights.meta.samples}サンプル / defaultAcc=${weights.meta.defaultAcc}
   リーダー別: ${weights.meta.perLeader.join(' ')}
   形式: window.AI_WEIGHTS = { features, leaderKeys, byLeader:{リーダー:{w,b}}, default:{w,b}, meta }。
   null/未知リーダーは evalWinProb が default→手作りeval へフォールバック。 */
window.AI_WEIGHTS = ${JSON.stringify(weights, null, 0)};
`;
fs.writeFileSync(path.join(ROOT, 'src', 'ai-weights.js'), file);
console.log('✓ src/ai-weights.js を書き出しました（リーダー別 ' + Object.keys(weights.byLeader).length + '種・default acc=' + weights.meta.defaultAcc + '）');

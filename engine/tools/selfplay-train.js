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
const MODEL = process.env.OPCG_MODEL || 'linear';   // 'linear'(ロジ回帰) or 'mlp'(NN・隠れ1層)。Stage A=mlp
const HIDDEN = +(process.env.OPCG_HIDDEN || 24);     // mlpの隠れユニット数

const harness = String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };

const GAMES = ` + GAMES + `, MCTS_GAMES = ` + MCTS_GAMES + `, MODEL = ` + JSON.stringify(MODEL) + `, HIDDEN = ` + HIDDEN + `;
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
// ---- NN(MLP・隠れ1層 ReLU→sigmoid) 純JSバックプロップ。標準化はモデルに同梱（推論側 mlpForward と一致） ----
function trainMLP(X, y, h, epochs, lr) {
  const n = X.length, d = X[0].length;
  const mean = new Array(d).fill(0), std = new Array(d).fill(0);
  for (const r of X) for (let j = 0; j < d; j++) mean[j] += r[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  for (const r of X) for (let j = 0; j < d; j++) { const dv = r[j] - mean[j]; std[j] += dv * dv; }
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n) || 1;
  const Xs = X.map(r => r.map((v, j) => (v - mean[j]) / std[j]));
  seedRng(777);                                                   // 決定論的初期化（学習の再現性）
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const s1 = Math.sqrt(2 / d), s2 = Math.sqrt(2 / h);
  const W1 = Array.from({ length: h }, () => Array.from({ length: d }, () => gauss() * s1)), b1 = new Array(h).fill(0);
  const W2 = Array.from({ length: h }, () => gauss() * s2); let b2 = 0;
  // モメンタム
  const vW1 = W1.map(r => r.map(() => 0)), vb1 = new Array(h).fill(0), vW2 = new Array(h).fill(0); let vb2 = 0;
  const mom = 0.9, BS = 256;
  const order = Xs.map((_, i) => i);
  for (let e = 0; e < epochs; e++) {
    for (let i = order.length - 1; i > 0; i--) { const j = rng() * (i + 1) | 0;[order[i], order[j]] = [order[j], order[i]]; }
    for (let bstart = 0; bstart < n; bstart += BS) {
      const batch = order.slice(bstart, bstart + BS), m = batch.length;
      const gW1 = W1.map(r => r.map(() => 0)), gb1 = new Array(h).fill(0), gW2 = new Array(h).fill(0); let gb2 = 0;
      for (const idx of batch) {
        const x = Xs[idx]; const z1 = new Array(h), a1 = new Array(h);
        for (let k = 0; k < h; k++) { let z = b1[k]; const w1 = W1[k]; for (let j = 0; j < d; j++) z += w1[j] * x[j]; z1[k] = z; a1[k] = z > 0 ? z : 0; }
        let z2 = b2; for (let k = 0; k < h; k++) z2 += W2[k] * a1[k];
        const p = 1 / (1 + Math.exp(-z2)), dz2 = p - y[idx];
        gb2 += dz2; for (let k = 0; k < h; k++) { gW2[k] += dz2 * a1[k]; const dz1 = (z1[k] > 0 ? 1 : 0) * dz2 * W2[k]; gb1[k] += dz1; const g = gW1[k]; for (let j = 0; j < d; j++) g[j] += dz1 * x[j]; }
      }
      for (let k = 0; k < h; k++) {
        vb1[k] = mom * vb1[k] - lr * (gb1[k] / m); b1[k] += vb1[k];
        vW2[k] = mom * vW2[k] - lr * (gW2[k] / m); W2[k] += vW2[k];
        for (let j = 0; j < d; j++) { vW1[k][j] = mom * vW1[k][j] - lr * (gW1[k][j] / m); W1[k][j] += vW1[k][j]; }
      }
      vb2 = mom * vb2 - lr * (gb2 / m); b2 += vb2;
    }
  }
  const rnd = a => Array.isArray(a) ? a.map(rnd) : +a.toFixed(5);
  return { type: 'mlp', mean: mean.map(v => +v.toFixed(5)), std: std.map(v => +v.toFixed(5)), W1: rnd(W1), b1: rnd(b1), W2: rnd(W2), b2: +b2.toFixed(5) };
}
function mlpFwd(m, v) {
  const x = v.map((val, i) => (val - m.mean[i]) / (m.std[i] || 1));
  const a1 = m.b1.map((b, k) => { let z = b; const w1 = m.W1[k]; for (let j = 0; j < x.length; j++) z += w1[j] * x[j]; return z > 0 ? z : 0; });
  let z2 = m.b2; for (let k = 0; k < a1.length; k++) z2 += m.W2[k] * a1[k];
  return 1 / (1 + Math.exp(-z2));
}
function mlpAcc(X, y, m) { let ok = 0; for (let i = 0; i < X.length; i++) if ((mlpFwd(m, X[i]) >= 0.5 ? 1 : 0) === y[i]) ok++; return ok / X.length; }
// バケツ samples→(X,y) 化＋8:2分割で学習し {w,b,n,valAcc,base} を返す
function fit(samples) {
  const X = [], y = [];
  for (const s of samples) { const w = WIN[s.gi]; if (w !== 'me' && w !== 'cpu') continue; X.push(s.f); y.push(w === s.side ? 1 : 0); }
  if (X.length < 400) return null;
  const idx = X.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = (i * 1103515245 + 12345 >>> 0) % (i + 1);[idx[i], idx[j]] = [idx[j], idx[i]]; }
  const cut = Math.floor(idx.length * 0.8), Xtr = [], ytr = [], Xva = [], yva = [];
  idx.forEach((k, r) => { (r < cut ? Xtr : Xva).push(X[k]); (r < cut ? ytr : yva).push(y[k]); });
  const base = +(yva.reduce((a, v) => a + v, 0) / yva.length).toFixed(3);
  if (MODEL === 'mlp') {
    const m = trainMLP(Xtr, ytr, HIDDEN, 300, 0.05);
    return Object.assign(m, { n: X.length, valAcc: +mlpAcc(Xva, yva, m).toFixed(4), base });
  }
  const m = train(Xtr, ytr, 400, 0.5, 1e-4);
  return { w: m.w.map(v => +v.toFixed(5)), b: +m.b.toFixed(5), n: X.length, valAcc: +evalAcc(Xva, yva, m.w, m.b).toFixed(4), base };
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
  // 学習メタ(n/valAcc/base)を除いたモデル本体だけを抽出（線形:{w,b} / MLP:{type,mean,std,W1,b1,W2,b2}）
  const modelOf = r => { const o = {}; for (const k in r) if (k !== 'n' && k !== 'valAcc' && k !== 'base') o[k] = r[k]; return o; };
  const byLeader = {}, report = [];
  const keys = [...new Set(SAMP.map(s => s.lk))].filter(Boolean);
  for (const k of keys) { const r = fit(SAMP.filter(s => s.lk === k)); if (r) { byLeader[k] = modelOf(r); report.push(k + '(n=' + r.n + ',acc=' + r.valAcc + ')'); } }
  const dft = fit(SAMP); const def = dft ? modelOf(dft) : null;
  const out = { features: EVAL_FEATURES, leaderKeys: LEADER_KEYS, byLeader, default: def,
    meta: { games: GAMES, samples: SAMP.length, perLeader: report, defaultAcc: dft ? dft.valAcc : null } };
  console.log('learned leaders: ' + report.join(' '));
  console.log('default acc=' + (dft ? dft.valAcc : 'n/a') + ' (多数派' + (dft ? dft.base : '-') + ')');
  // ★大きなJSON(MLP)は console.log+process.exit だと pipe フラッシュ前に切れる→write完了後exit
  process.stdout.write('__WEIGHTS__' + JSON.stringify(out), () => process.exit(0));
})();
`;

let stdout;
try { stdout = runHarness('selfplay', harness, { timeout: 590000 }); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
const _mk = stdout.lastIndexOf('__WEIGHTS__');
process.stdout.write(stdout.slice(0, _mk < 0 ? undefined : _mk));
if (_mk < 0) { console.error('✗ 学習結果(__WEIGHTS__)が取得できませんでした'); process.exit(1); }
const weights = JSON.parse(stdout.slice(_mk + '__WEIGHTS__'.length).trim());
const file = `/* src/ai-weights.js — L3: 自己対戦で学習した【リーダー別】盤面評価の重み。tools/selfplay-train.js が自動生成。手で編集しない。
   学習: ${weights.meta.games}局(6リーダー対フィールド) / ${weights.meta.samples}サンプル / defaultAcc=${weights.meta.defaultAcc}
   リーダー別: ${weights.meta.perLeader.join(' ')}
   形式: window.AI_WEIGHTS = { features, leaderKeys, byLeader:{リーダー:{w,b}}, default:{w,b}, meta }。
   null/未知リーダーは evalWinProb が default→手作りeval へフォールバック。 */
window.AI_WEIGHTS = ${JSON.stringify(weights, null, 0)};
`;
fs.writeFileSync(path.join(ROOT, 'src', 'ai-weights.js'), file);
console.log('✓ src/ai-weights.js を書き出しました（リーダー別 ' + Object.keys(weights.byLeader).length + '種・default acc=' + weights.meta.defaultAcc + '）');

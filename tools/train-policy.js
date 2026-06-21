#!/usr/bin/env node
/* tools/train-policy.js — Stage B: アタック方策ネット(per-action policy prior)を自己対戦から学習 → src/ai-policy.js 生成。
   使い方: node tools/train-policy.js                 （既定720局・6リーダー対フィールド）
           OPCG_GAMES=1200 OPCG_HIDDEN=16 node tools/train-policy.js
           OPCG_DECKS='teach,enel' node tools/train-policy.js   （特定マッチアップに絞る）
   仕組み:
     1) heuristic自己対戦を回し、cpuPickAttack の【各アタック判断】を全候補(各attack＋stop)つきで記録(behavioral cloning)。
        各サンプル = { 候補手のpolFeatures配列, 選ばれた候補index, リーダーキー }。
     2) 候補集合上の softmax 交差エントロピーで per-action 方策MLPを学習（標準化＋隠れ1層ReLU）。
     3) window.AI_POLICY = { feat, leaderKeys, byLeader:{lk:{type:'policy',...}}, default, meta } を src/ai-policy.js へ。
   ★ Stage B＝教師(heuristic)の蒸留なので強さは ≈heuristic（想定どおり）。Stage C で同じネットを
     「探索(MCTS)が改善した着手」に再学習目標を差し替えるだけで強化できる（足場）。
   ★ polFeatures/POL_FEAT は src/70-ai.js と同一（学習と推論で一致が前提）。特徴量を変えたら再学習する。 */
const fs = require('fs'), path = require('path');
const { runHarness, ROOT } = require('./../tests/_load-app');

const GAMES = +(process.env.OPCG_GAMES || 720);
const HIDDEN = +(process.env.OPCG_HIDDEN || 16);
const DECKS_POOL = (process.env.OPCG_DECKS || 'lucy,ace,nami,hancock,teach,enel').split(',').map(s => s.trim()).filter(Boolean);

const harness = String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };

const GAMES = ` + GAMES + `, HIDDEN = ` + HIDDEN + `;
const LEADERS = ` + JSON.stringify(DECKS_POOL) + `;
const POL = [];   // {cands:[[...polFeat]], ci:選択index, lk}
let GI = -1, REC = false;

// ★cpuPickAttack をフック: 各アタック判断を「全候補(attack＋stop)＋heuristicの選択」で記録(BC)
const _cpa = cpuPickAttack;
cpuPickAttack = function (side, plan) {
  if (REC && !G._sim && G.players[side] && G.players[side].leader) {
    const atts = legalActions(side).filter(a => a.k === 'attack');
    if (atts.length) {
      const cands = [...atts, { k: 'stop' }];
      const feats = cands.map(a => polFeatures(side, a));
      const pick = _cpa(side, plan);   // ★本体（donも付与される）。featは付与前に計算済み＝推論と一致
      let ci = cands.length - 1;        // 既定=stop（pick==null）
      if (pick) { const j = atts.findIndex(a => a.auid === pick.attacker.uid && a.tuid === pick.target.uid); if (j >= 0) ci = j; }
      POL.push({ cands: feats, ci, lk: leaderKeyOf(side) });
      return pick;
    }
  }
  return _cpa(side, plan);
};

async function playGame(seed, dMe, dCpu) {
  GI++; G.players = {}; G.winner = null; G.inGame = false;
  seedRng(seed); REC = true;
  startGame(dMe, dCpu);
  G.players.me.isCPU = true; G.players.me.agent = 'heuristic'; G.players.cpu.agent = 'heuristic';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  REC = false;
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));   // ドレイン（次局に漏らさない）
}

// ===== softmax-CE per-action 方策MLP（隠れ1層ReLU）。純JSバックプロップ・外部依存なし =====
function trainPolicy(samples, d, h, epochs, lr) {
  // 標準化: 全候補ベクトルから mean/std
  const mean = new Array(d).fill(0), std = new Array(d).fill(0); let cnt = 0;
  for (const s of samples) for (const v of s.cands) { for (let j = 0; j < d; j++) mean[j] += v[j]; cnt++; }
  for (let j = 0; j < d; j++) mean[j] /= cnt;
  for (const s of samples) for (const v of s.cands) for (let j = 0; j < d; j++) { const dv = v[j] - mean[j]; std[j] += dv * dv; }
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / cnt) || 1;
  const norm = v => v.map((x, j) => (x - mean[j]) / std[j]);
  seedRng(991);
  const gauss = () => { let u = 0, w = 0; while (u === 0) u = rng(); while (w === 0) w = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
  const s1 = Math.sqrt(2 / d), s2 = Math.sqrt(2 / h);
  const W1 = Array.from({ length: h }, () => Array.from({ length: d }, () => gauss() * s1)), b1 = new Array(h).fill(0);
  const W2 = Array.from({ length: h }, () => gauss() * s2); let b2 = 0;
  const vW1 = W1.map(r => r.map(() => 0)), vb1 = new Array(h).fill(0), vW2 = new Array(h).fill(0); let vb2 = 0;
  const mom = 0.9, BS = 64;
  const order = samples.map((_, i) => i);
  // 1サンプルの前向き: 各候補のロジット z2 と隠れ a1 を返す
  function fwd(cands) {
    return cands.map(v => {
      const x = norm(v), a1 = new Array(h);
      let z2 = b2; for (let k = 0; k < h; k++) { let z = b1[k]; const w1 = W1[k]; for (let j = 0; j < d; j++) z += w1[j] * x[j]; a1[k] = z > 0 ? z : 0; z2 += W2[k] * a1[k]; }
      return { x, a1, z2 };
    });
  }
  for (let e = 0; e < epochs; e++) {
    for (let i = order.length - 1; i > 0; i--) { const j = rng() * (i + 1) | 0;[order[i], order[j]] = [order[j], order[i]]; }
    for (let bs = 0; bs < order.length; bs += BS) {
      const batch = order.slice(bs, bs + BS), m = batch.length;
      const gW1 = W1.map(r => r.map(() => 0)), gb1 = new Array(h).fill(0), gW2 = new Array(h).fill(0); let gb2 = 0;
      for (const si of batch) {
        const s = samples[si], outs = fwd(s.cands);
        let mx = -Infinity; for (const o of outs) if (o.z2 > mx) mx = o.z2;
        let sum = 0; for (const o of outs) { o.p = Math.exp(o.z2 - mx); sum += o.p; }
        for (const o of outs) o.p /= sum;
        for (let c = 0; c < outs.length; c++) {
          const o = outs[c], g = o.p - (c === s.ci ? 1 : 0);   // dL/dz2
          gb2 += g; for (let k = 0; k < h; k++) { gW2[k] += g * o.a1[k]; const dz = (o.a1[k] > 0 ? 1 : 0) * g * W2[k]; gb1[k] += dz; const gr = gW1[k]; for (let j = 0; j < d; j++) gr[j] += dz * o.x[j]; }
        }
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
  const model = { type: 'policy', mean: mean.map(v => +v.toFixed(5)), std: std.map(v => +v.toFixed(5)), W1: rnd(W1), b1: rnd(b1), W2: rnd(W2), b2: +b2.toFixed(5) };
  return { model, fwd };
}
// top-1一致率（argmaxロジット == heuristicの選択）
function polAcc(samples, fwd) {
  let ok = 0; for (const s of samples) { const outs = fwd(s.cands); let bi = 0, bz = -Infinity; outs.forEach((o, c) => { if (o.z2 > bz) { bz = o.z2; bi = c; } }); if (bi === s.ci) ok++; }
  return samples.length ? ok / samples.length : 0;
}
function fitPolicy(samples) {
  if (samples.length < 300) return null;
  const d = samples[0].cands[0].length;
  const idx = samples.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = (i * 1103515245 + 12345 >>> 0) % (i + 1);[idx[i], idx[j]] = [idx[j], idx[i]]; }
  const cut = Math.floor(idx.length * 0.85), tr = [], va = [];
  idx.forEach((k, r) => (r < cut ? tr : va).push(samples[k]));
  const { model, fwd } = trainPolicy(tr, d, HIDDEN, 220, 0.1);
  // 「stopでない＝実際に攻撃した」サンプルだけのbaseline比較もしたいが、まずは全体top-1で見る
  return { model, n: samples.length, valAcc: +polAcc(va, fwd).toFixed(4), stopRate: +(samples.filter(s => s.ci === s.cands.length - 1).length / samples.length).toFixed(3) };
}

(async () => {
  const NL = LEADERS.length;
  for (let i = 0; i < GAMES; i++) await playGame(300000 + i, LEADERS[i % NL], LEADERS[(i / NL | 0) % NL]);
  console.log('収集: ' + POL.length + ' アタック判断サンプル（' + GAMES + '局）');
  const byLeader = {}, report = [];
  const keys = [...new Set(POL.map(s => s.lk))].filter(Boolean);
  for (const k of keys) { const r = fitPolicy(POL.filter(s => s.lk === k)); if (r) { byLeader[k] = r.model; report.push(k + '(n=' + r.n + ',top1=' + r.valAcc + ',stop=' + r.stopRate + ')'); } }
  const dft = fitPolicy(POL); const def = dft ? dft.model : null;
  const out = { feat: POL_FEAT, leaderKeys: ['lucy', 'ace', 'nami', 'hancock', 'teach', 'enel'], byLeader, default: def,
    meta: { games: GAMES, samples: POL.length, perLeader: report, defaultTop1: dft ? dft.valAcc : null, hidden: HIDDEN } };
  console.log('学習: ' + report.join(' '));
  console.log('default top1=' + (dft ? dft.valAcc : 'n/a'));
  // ★大きなJSON(~18KB)は console.log+process.exit だと pipe へのフラッシュ前に切れる→write完了コールバックでexit
  process.stdout.write('__POLICY__' + JSON.stringify(out), () => process.exit(0));
})();
`;

let stdout;
try { stdout = runHarness('trainpolicy', harness, { timeout: 590000 }); }
catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
const _mk = stdout.lastIndexOf('__POLICY__');
process.stdout.write(stdout.slice(0, _mk < 0 ? undefined : _mk));
if (_mk < 0) { console.error('✗ 学習結果(__POLICY__)が取得できませんでした'); process.exit(1); }
const pol = JSON.parse(stdout.slice(_mk + '__POLICY__'.length).trim());
const file = `/* src/ai-policy.js — Stage B: 自己対戦で学習した【アタック方策prior】(per-action policy net)。tools/train-policy.js が自動生成。手で編集しない。
   学習: ${pol.meta.games}局 / ${pol.meta.samples}アタック判断サンプル / default top1=${pol.meta.defaultTop1} / hidden=${pol.meta.hidden}
   リーダー別: ${pol.meta.perLeader.join(' ')}
   形式: window.AI_POLICY = { feat, leaderKeys, byLeader:{リーダー:{type:'policy',mean,std,W1,b1,W2,b2}}, default, meta }。
   null/未知リーダーは policyPickAttack が null を返し cpuPickAttack にフォールバック（退行しない）。 */
window.AI_POLICY = ${JSON.stringify(pol, null, 0)};
`;
fs.writeFileSync(path.join(ROOT, 'src', 'ai-policy.js'), file);
console.log('✓ src/ai-policy.js を書き出しました（リーダー別 ' + Object.keys(pol.byLeader).length + '種・default top1=' + pol.meta.defaultTop1 + '）');

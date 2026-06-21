#!/usr/bin/env node
/* tools/selfplay-iterate.js — Stage C: 自己対戦【反復】ループ（AlphaZeroの心臓部のJS版・DAgger型policy iteration）。
   使い方: node tools/selfplay-iterate.js                （既定2世代・各120局）
           OPCG_GENS=3 OPCG_GAMES=200 node tools/selfplay-iterate.js
   1世代のループ:
     1) 【生徒】＝現在の方策ネット(src/ai-policy.js, 無ければheuristic)で自己対戦し状態分布を作る。
     2) 各アタック判断で【教師】＝improvedAttack(1-ply価値先読み・src/70-ai.js)が「正解ラベル」を出す（DAgger）。
     3) 集めた(状態,教師ラベル)で方策ネットを再学習 → src/ai-policy.js を更新（次世代の生徒）。
     4) measure-matchup で npolicy vs heuristic を測り、世代ごとの強さ推移を記録。
   ★ 期待: 価値(≈heuristic)由来の教師なので各世代 ≈heuristic（JS規模の上限・docs/ai-design.md §7）。
     本当に超えるには「探索を強く＋価値/方策をNNで大量self-play」＝Python/GPU。本ツールはその【正しい足場】の実機検証。
   ★ ループの正しさ（決定境界・ドレイン・元参照復元）は L2/Stage A/B と同じ規律を踏襲。 */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { runHarness, ROOT } = require('./../tests/_load-app');

const GENS = +(process.env.OPCG_GENS || 2);
const GAMES = +(process.env.OPCG_GAMES || 80);   // DAgger自己対戦は教師の先読みで重い→1世代がharness 590s上限に収まる規模（120はgen2でtimeout）
const HIDDEN = +(process.env.OPCG_HIDDEN || 16);
const DECKS_POOL = (process.env.OPCG_DECKS || 'lucy,ace,nami,hancock,teach,enel').split(',').map(s => s.trim()).filter(Boolean);

function genHarness(seed0) {
  return String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };

const GAMES = ` + GAMES + `, HIDDEN = ` + HIDDEN + `, SEED0 = ` + seed0 + `;
const LEADERS = ` + JSON.stringify(DECKS_POOL) + `;
const POL = []; let GI = -1, REC = false;

// ★教師 improvedAttack をフック: 各アタック判断の (候補polFeatures, 教師の選択index, リーダー) を記録（DAggerのラベル）
const _imp = improvedAttack;
improvedAttack = async function (side, plan) {
  const r = await _imp(side, plan);
  if (REC && !G._sim && r) POL.push({ cands: r.feats, ci: r.ci, lk: r.lk });
  return r;
};

async function playGame(seed, dMe, dCpu) {
  GI++; G.players = {}; G.winner = null; G.inGame = false;
  seedRng(seed); REC = true;
  startGame(dMe, dCpu);
  // 両者 npimprove＝生徒がプレイし教師がラベル付け（src/50の _polImprove 分岐）
  G.players.me.isCPU = true; G.players.me.agent = 'npimprove'; G.players.cpu.agent = 'npimprove';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  REC = false;
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));   // ドレイン（次局に漏らさない）
}

// ===== softmax-CE per-action 方策MLP（train-policy.js と同一） =====
function trainPolicy(samples, d, h, epochs, lr) {
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
          const o = outs[c], g = o.p - (c === s.ci ? 1 : 0);
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
function polAcc(samples, fwd) { let ok = 0; for (const s of samples) { const outs = fwd(s.cands); let bi = 0, bz = -Infinity; outs.forEach((o, c) => { if (o.z2 > bz) { bz = o.z2; bi = c; } }); if (bi === s.ci) ok++; } return samples.length ? ok / samples.length : 0; }
function fitPolicy(samples) {
  if (samples.length < 300) return null;
  const d = samples[0].cands[0].length;
  const idx = samples.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = (i * 1103515245 + 12345 >>> 0) % (i + 1);[idx[i], idx[j]] = [idx[j], idx[i]]; }
  const cut = Math.floor(idx.length * 0.85), tr = [], va = [];
  idx.forEach((k, r) => (r < cut ? tr : va).push(samples[k]));
  const { model, fwd } = trainPolicy(tr, d, HIDDEN, 220, 0.1);
  return { model, n: samples.length, valAcc: +polAcc(va, fwd).toFixed(4), stopRate: +(samples.filter(s => s.ci === s.cands.length - 1).length / samples.length).toFixed(3) };
}

(async () => {
  const NL = LEADERS.length;
  for (let i = 0; i < GAMES; i++) await playGame(SEED0 + i, LEADERS[i % NL], LEADERS[(i / NL | 0) % NL]);
  console.log('収集: ' + POL.length + ' 教師ラベル（' + GAMES + '局・生徒分布）');
  const byLeader = {}, report = [];
  for (const k of [...new Set(POL.map(s => s.lk))].filter(Boolean)) { const r = fitPolicy(POL.filter(s => s.lk === k)); if (r) { byLeader[k] = r.model; report.push(k + '(n=' + r.n + ',top1=' + r.valAcc + ')'); } }
  const dft = fitPolicy(POL); const def = dft ? dft.model : null;
  const out = { feat: POL_FEAT, leaderKeys: ['lucy', 'ace', 'nami', 'hancock', 'teach', 'enel'], byLeader, default: def,
    meta: { games: GAMES, samples: POL.length, perLeader: report, defaultTop1: dft ? dft.valAcc : null, hidden: HIDDEN, stage: 'C' } };
  console.log('再学習: ' + report.join(' ') + ' / default top1=' + (dft ? dft.valAcc : 'n/a'));
  process.stdout.write('__POLICY__' + JSON.stringify(out), () => process.exit(0));
})();
`;
}

function measure() {
  try {
    const out = cp.execSync('node ' + JSON.stringify(path.join(__dirname, 'measure-matchup.js')),
      { encoding: 'utf8', env: Object.assign({}, process.env, { OPCG_AGENT: 'npolicy', OPCG_N: process.env.OPCG_MEASURE_N || '40' }), timeout: 590000 });
    return out.split('\n').filter(l => /vs/.test(l) && /対h/.test(l)).map(l => '    ' + l.trim()).join('\n');
  } catch (e) { return '    (measure失敗: ' + ((e.stdout || '') + (e.stderr || '')).slice(-200) + ')'; }
}

(async () => {
  console.log('▶ Stage C: 自己対戦反復ループ（' + GENS + '世代 × ' + GAMES + '局・DAgger）');
  console.log('  世代0（再学習前=現在の方策）の強さ:'); console.log(measure());
  for (let g = 1; g <= GENS; g++) {
    let stdout;
    try { stdout = runHarness('iterate-g' + g, genHarness(400000 + g * 10000), { timeout: 590000 }); }
    catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
    const mk = stdout.lastIndexOf('__POLICY__');
    process.stdout.write(stdout.slice(0, mk < 0 ? undefined : mk));
    if (mk < 0) { console.error('✗ 世代' + g + ': __POLICY__取得失敗'); process.exit(1); }
    const pol = JSON.parse(stdout.slice(mk + '__POLICY__'.length).trim());
    const file = `/* src/ai-policy.js — Stage C(自己対戦反復 第${g}世代): 教師=1-ply価値先読みのDAgger再学習。tools/selfplay-iterate.js が自動生成。手で編集しない。
   ${pol.meta.games}局 / ${pol.meta.samples}教師ラベル / default top1=${pol.meta.defaultTop1} / hidden=${pol.meta.hidden}
   リーダー別: ${pol.meta.perLeader.join(' ')}
   形式は train-policy.js と同一（window.AI_POLICY）。null/未知は cpuPickAttack へフォールバック。 */
window.AI_POLICY = ${JSON.stringify(pol, null, 0)};
`;
    fs.writeFileSync(path.join(ROOT, 'src', 'ai-policy.js'), file);
    console.log('  ✓ 世代' + g + ' 書き出し（リーダー別 ' + Object.keys(pol.byLeader).length + '種）。強さ:');
    console.log(measure());
  }
  console.log('▶ Stage C 完了。各世代の「npolicy 対h」が強さ推移。');
})();

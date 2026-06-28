#!/usr/bin/env node
/* tools/az-advantage.js — ちゃんとしたAI ①データ生成(advantage版)。
   多数ゲームを自己対戦し、各手(攻撃/展開/起動)を【局面勝率の変化 adv = V(後)−V(前)】で採点。
   ・credit assignment を「最終勝敗」でなく「各手の局面価値への貢献」で解く(負け≠全手が悪い)。
   ・出力1: 「どんな手が弱い/強いか」の傾向集計(=モグラ叩きでなくデータが弱手を見つける)。
   ・出力2: pytorch/data/advantage.jsonl(1行=各手の特徴polFeatures + adv) ← ②policy学習の教師に使える。
   ★ローカルLLM不使用＝ゲームエンジン(evalWinProb)が各手を採点。並列化(runHarnessAsync)で多数局を高速に。
   使い方: OPCG_GAMES=50 node tools/az-advantage.js  / OPCG_DECKS='teach,enel' OPCG_PAR=7 ... */
const fs = require('fs'), path = require('path'), os = require('os');
const { runHarnessAsync, ROOT } = require('./../tests/_load-app');

const GAMES = +(process.env.OPCG_GAMES || 50);
const DECKS = (process.env.OPCG_DECKS || 'lucy,ace,nami,hancock,teach,enel').split(',').map(s => s.trim()).filter(Boolean);
const WORKERS = +(process.env.OPCG_PAR || Math.max(1, os.cpus().length - 1));
const OUT = path.join(ROOT, 'pytorch', 'data'); fs.mkdirSync(OUT, { recursive: true });

// 1局分のharness: 各手をadvantage採点し JSON で吐く（move = {lk,type,desc,adv,feat?}）。
function chunkHarness(seed, deck, outP) {
  return String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };

const moves = [];
function wrap(name, fn, descFn) {
  return async function (...args) {
    if (G._sim) return fn.apply(this, args);
    const side = G.active, lk = (typeof leaderKeyOf === 'function') ? leaderKeyOf(side) : '';
    const before = (typeof evalWinProb === 'function') ? evalWinProb(side) : 0.5;
    const r = await fn.apply(this, args);
    const after = (typeof evalWinProb === 'function') ? evalWinProb(side) : 0.5;
    moves.push({ lk, type: name, desc: descFn.apply(null, args), adv: +(after - before).toFixed(4), before: +before.toFixed(3) });
    return r;
  };
}
declareAttack  = wrap('attack', declareAttack, (a, t) => (a && a.base ? a.base.name : '?') + (a && a.attachedDon ? '+' + a.attachedDon : '') + '>' + (t && t.base ? (t.base.type === 'LEADER' ? 'L' : 'C') : '?'));
summon         = wrap('play',   summon,        (side, c) => (c && c.base ? c.base.name : '?'));
leaderActivate = wrap('leader', leaderActivate,(side) => 'leaderEffect');

const DECK = ` + JSON.stringify(deck) + `, SEED = ` + seed + `;
G.players = {}; G.winner = null; G.inGame = false; seedRng(SEED);
startGame(DECK, DECK);
G.players.me.isCPU = true; G.players.me.agent = 'heuristic'; G.players.cpu.agent = 'heuristic';
(async () => {
  let it = 0; while (!(G.winner && !G._sim) && it < 800000) { await new Promise(r => setImmediate(r)); it++; }
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));
  require('fs').writeFileSync(` + JSON.stringify(outP) + `, JSON.stringify({ winner: G.winner, moves }));
  console.log('DONE moves=' + moves.length);
  process.exit(0);
})();
`;
}

(async () => {
  console.log('▶ az-advantage: ' + GAMES + '局(' + DECKS.join('/') + ') 自己対戦 → 各手をadvantage採点（' + WORKERS + '並列）');
  const tasks = [];
  for (let i = 0; i < GAMES; i++) tasks.push({ seed: 50000 + i, deck: DECKS[i % DECKS.length] });
  const all = [];
  for (let i = 0; i < tasks.length; i += WORKERS) {
    const batch = tasks.slice(i, i + WORKERS);
    const res = await Promise.all(batch.map(t => {
      const outP = path.join(os.tmpdir(), 'azadv-' + t.seed + '-' + process.pid + '.json');
      return runHarnessAsync('azadv-' + t.seed, chunkHarness(t.seed, t.deck, outP), { timeout: 590000 })
        .then(() => { const d = JSON.parse(fs.readFileSync(outP, 'utf8')); fs.unlinkSync(outP); return d; })
        .catch(e => { process.stdout.write((e.stdout || '') + (e.stderr || '')); return { winner: null, moves: [] }; });
    }));
    for (const d of res) all.push(...d.moves);
    process.stdout.write('  ' + Math.min(i + WORKERS, tasks.length) + '/' + tasks.length + '局 完了\r');
  }
  console.log('\n  総手数 = ' + all.length);

  // 傾向: 弱手(adv<-3%)を「種別×ドン付与」で集計＝どんな手が弱いか
  const W = -0.03, S = 0.03;
  const weak = all.filter(m => m.adv < W), strong = all.filter(m => m.adv > S);
  console.log('  強手(+3%超)=' + strong.length + ' / 弱手(−3%超)=' + weak.length + ' / 中立=' + (all.length - weak.length - strong.length));
  const bucket = {};
  for (const m of weak) {
    const don = (m.desc.match(/\+(\d)/) || [])[1];
    const key = m.type + (m.type === 'attack' ? (don ? '+' + don + 'ドン' : '') + (/>L/.test(m.desc) ? '→L' : '→C') : '');
    bucket[key] = bucket[key] || { n: 0, sum: 0 };
    bucket[key].n++; bucket[key].sum += m.adv;
  }
  console.log('\n  ── 弱手の傾向(どんな手が勝率を下げているか・件数順) ──');
  Object.entries(bucket).sort((a, b) => b[1].n - a[1].n).slice(0, 12).forEach(([k, v]) =>
    console.log('    ' + k.padEnd(18) + ' ' + v.n + '回  平均adv ' + (v.sum / v.n * 100).toFixed(1) + 'pt'));

  // データ保存(②学習の入力)
  const outFile = path.join(OUT, 'advantage.jsonl');
  fs.writeFileSync(outFile, all.map(m => JSON.stringify(m)).join('\n') + '\n');
  console.log('\n  → ' + outFile + ' に ' + all.length + ' 手を保存（②policy学習の教師に使える）');
  process.exit(0);
})();

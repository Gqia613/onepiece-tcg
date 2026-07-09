#!/usr/bin/env node
/* tools/measure-matchup.js — 指定マッチアップでMCTSの実効果を【ペア比較・大N】で精密測定する。
   使い方: node tools/measure-matchup.js                （既定: teach と enel を相互対戦・各N=60）
           OPCG_HERO=teach OPCG_VILLAIN=enel OPCG_N=80 node tools/measure-matchup.js
   なぜペア比較か: 同一seed(=同じ運)で「heuristic」と「mcts」を打ち比べ、勝敗の食い違い(flip)だけを数える。
     運の分散が相殺されN=数十でも差が見える（独立N=数百相当）。N=30の「ノイズで判定不能」を解消する道具。
   出力: 各heroについて h-h勝率 / mcts勝率 / 実効果 / ペア(mctsが勝ちheuristicが負け=改善, 逆=退行) / 二項片側p値。
   ★mcts局は重い(~8s)。harness制限(590s)に収まるよう CHUNK 件ずつ分割実行して集計する。
     学習eval(src/ai-weights.js)があればmctsは自動でそれを使う＝学習前後をこの道具で同条件比較できる。 */
const { runHarness } = require('./../tests/_load-app');

const PAIRS = process.env.OPCG_HERO
  ? [[process.env.OPCG_HERO, process.env.OPCG_VILLAIN || 'enel']]
  : [['teach', 'enel'], ['enel', 'teach']];   // 既定: ティーチ視点・エネル視点の両方
const N = +(process.env.OPCG_N || 60);
const AGENT = process.env.OPCG_AGENT || 'mcts';   // 評価するhero方策（mcts / vlook 等）。heuristicと同一seedで比較
const BASE = process.env.OPCG_BASE || 'heuristic'; // ★E41: 基準アームの方策。puct系の上乗せ改良は OPCG_BASE=puct で同一プロセス内の直接ペア比較にする（DB変動に頑健）
const THR = process.env.OPCG_THR || '';            // ★E40: heur3部品の単離（例 OPCG_THR=hold → holdのみon）。空=全部on
const H2 = process.env.OPCG_H2 || '';              // ★E42: heur2部品の単離（lethal / trigger）。空=全部on
const SEED0 = +(process.env.OPCG_SEED0 || 600000);
const CHUNK = +(process.env.OPCG_CHUNK || 50);   // 1harnessあたりの試合数（mcts ~8s なので 50×8=400s<590s）
// AGENT=hybrid のLLM戦略キャッシュ(fixture)。事前ウォーム(tools/llm-warm-cache.js)した戦略を流し込み、live問い合わせ無しで決定的に再生する。
const LLM_CACHE_JSON = process.env.OPCG_LLM_CACHE ? require('fs').readFileSync(process.env.OPCG_LLM_CACHE, 'utf8') : 'null';

function chunkHarness(hero, villain, s0, n) {
  return String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };
if (typeof loadLLMCache === 'function') loadLLMCache(` + LLM_CACHE_JSON + `);  // AGENT=hybrid用のLLM戦略キャッシュ(あれば。無ければnull=liveフォールバック)
const HERO = ` + JSON.stringify(hero) + `, VILLAIN = ` + JSON.stringify(villain) + `, S0 = ` + s0 + `, N = ` + n + `, AGENT = ` + JSON.stringify(AGENT) + `, BASE = ` + JSON.stringify(BASE) + `, LIFE_AGGR = ` + (+process.env.OPCG_LIFE_AGGR || 0) + `, NOSKIP = ` + (process.env.OPCG_NOSKIP === '1') + `;
G._thrParts = ` + (THR ? JSON.stringify(Object.fromEntries(THR.split(',').map(s => [s.trim(), 1]))) : 'null') + `;   // E40部品の単離（null=全部on）
G._h2Parts = ` + (H2 ? JSON.stringify(Object.fromEntries(H2.split(',').map(s => [s.trim(), 1]))) : 'null') + `;    // E42部品の単離（null=全部on）
const MCTS_R = ` + (+process.env.OPCG_MCTS_ROLLOUTS || 0) + `, MCTS_D = ` + (+process.env.OPCG_MCTS_DEPTH || 0) + `;   // 0=既定(8/4)のまま。E36: mctsの計算スケーリング測定用
const SAVED_W = (typeof window !== 'undefined') ? window.AI_WEIGHTS : null;  // ロード済み学習重み（あれば）
const HAS_LEARNED = !!(SAVED_W && (SAVED_W.byLeader || SAVED_W.w));
// hero=me(評価対象), villain=cpu(常にheuristic)。heroAgent/学習eval使用 を切替。勝者の席を返す。
async function pg(seed, heroAgent, useLearned) {
  if (typeof window !== 'undefined') window.AI_WEIGHTS = useLearned ? SAVED_W : null;  // mctsのeval切替
  G.players = {}; G.winner = null; G.inGame = false;
  seedRng(seed);
  startGame(HERO, VILLAIN);
  G.players.me.isCPU = true; G.players.me.agent = heroAgent; G.players.cpu.agent = 'heuristic';
  G._lifeAggr = LIFE_AGGR;   // ★殴り残しペナルティ実験(0=無効)。heroのpuct/mctsの境界value評価に効く
  G._puctNoSkip = NOSKIP;    // ★OPCG_NOSKIP=1: enel等のPUCT_MCTS/PUCT_SKIPフォールバックを無効化し本物のpuctを測る(E35)
  G._mctsRollouts = MCTS_R || null; G._mctsDepth = MCTS_D || null;   // ★E36: mcts計算量の上書き(0/null=既定8/4)
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));  // ★保留タスクを消化（次局に漏らさない＝再現性確保）
  return G.winner === 'me';
}
(async () => {
  // 同一seedで3アーム: heuristic / AGENT(手作りeval) / AGENT(学習eval)。学習無しならmLは省略。
  let hWin = 0, mhWin = 0, mlWin = 0, imp = 0, reg = 0;     // imp/reg = 学習 vs 手作り のflip
  let impH = 0, regH = 0, impL = 0, regL = 0;               // impH/regH = AGENT(手作り) vs h ／ impL/regL = AGENT(学習) vs h のflip
  const ROWS = [];                                          // ★E38: per-seed勝敗（OPCG_DUMP用。親がDUMPROWSを回収）
  for (let i = 0; i < N; i++) {
    const seed = S0 + i;
    const h = await pg(seed, BASE, false);                 // 基準アーム（既定heuristic。OPCG_BASE=puct等で差し替え可）
    const mh = await pg(seed, AGENT, false);               // hero方策（手作りeval）
    if (h) hWin++; if (mh) mhWin++;
    if (mh && !h) impH++; else if (!mh && h) regH++;        // 同一seedでAGENTが勝ちheuristicが負け=改善
    const row = { seed, h: h ? 1 : 0, mh: mh ? 1 : 0 };
    if (HAS_LEARNED) {
      const ml = await pg(seed, AGENT, true);              // hero方策（学習eval）
      if (ml) mlWin++;
      if (ml && !mh) imp++; else if (!ml && mh) reg++;
      if (ml && !h) impL++; else if (!ml && h) regL++;      // 学習evalアームの対h flip（E35: value+policy複合候補のgating指標）
      row.ml = ml ? 1 : 0;
    }
    ROWS.push(row);
  }
  console.log('DUMPROWS ' + JSON.stringify(ROWS));
  console.log('CHUNK ' + JSON.stringify({ hWin, mhWin, mlWin, imp, reg, impH, regH, impL, regL, n: N, learned: HAS_LEARNED }));
  process.exit(0);
})();
`;
}

// 二項片側p値（improvements vs regressions の不一致ペアで符号検定）
function signTestP(imp, reg) {
  const n = imp + reg; if (n === 0) return 1;
  const k = Math.min(imp, reg);
  let p = 0; for (let i = 0; i <= k; i++) { let c = 0; const lg = x => { let s = 0; for (let j = 2; j <= x; j++) s += Math.log(j); return s; }; c = lg(n) - lg(i) - lg(n - i); p += Math.exp(c + n * Math.log(0.5)); }
  return Math.min(1, 2 * p); // 両側
}

(async () => {
  console.log('▶ マッチアップ精密測定（ペア比較・同一seed, N=' + N + ' /hero, eval=' + (require('fs').existsSync(require('path').join(__dirname, '..', 'src', 'ai-weights.js')) ? 'src/ai-weights.js' : 'なし') + '）');
  const DUMP = process.env.OPCG_DUMP || '';   // ★E38: per-seed勝敗をJSONで書き出す（tools/compare-dumps.js で2つのdumpを直接flip比較）
  const dumpPairs = [];
  for (const [hero, villain] of PAIRS) {
    let hWin = 0, mhWin = 0, mlWin = 0, imp = 0, reg = 0, impH = 0, regH = 0, impL = 0, regL = 0, done = 0, learned = false;
    let rows = [];
    while (done < N) {
      const n = Math.min(CHUNK, N - done);
      let out;
      try { out = runHarness('measure', chunkHarness(hero, villain, SEED0 + done, n), { timeout: 590000 }); }
      catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
      const m = out.match(/CHUNK (\{.*\})/); if (!m) { console.error('✗ chunk結果なし\n' + out); process.exit(1); }
      const dm = out.match(/DUMPROWS (\[.*\])/); if (dm) rows = rows.concat(JSON.parse(dm[1]));
      const r = JSON.parse(m[1]); hWin += r.hWin; mhWin += r.mhWin; mlWin += r.mlWin; imp += r.imp; reg += r.reg; impH += r.impH || 0; regH += r.regH || 0; impL += r.impL || 0; regL += r.regL || 0; learned = learned || r.learned; done += n;
    }
    if (DUMP) dumpPairs.push({ hero, villain, rows });
    const effH = ((mhWin - hWin) / N * 100), pH = signTestP(impH, regH);
    let line = '  ' + hero + ' vs ' + villain + ' (N=' + N + '): ' + BASE + '=' + (100 * hWin / N).toFixed(1) + '%  ' + AGENT + '=' + (100 * mhWin / N).toFixed(1)
      + '%(対' + (BASE === 'heuristic' ? 'h' : BASE) + ' ' + (effH >= 0 ? '+' : '') + effH.toFixed(1) + 'pt 改善' + impH + '/退行' + regH + ' p=' + pH.toFixed(3) + (pH < 0.05 ? '★' : '') + ')';
    if (learned) {
      const effL = ((mlWin - hWin) / N * 100), effLvsH = ((mlWin - mhWin) / N * 100), p = signTestP(imp, reg), pL = signTestP(impL, regL);
      line += '  ' + AGENT + '学習=' + (100 * mlWin / N).toFixed(1) + '%(対h ' + (effL >= 0 ? '+' : '') + effL.toFixed(1) + 'pt 改善' + impL + '/退行' + regL + ' p=' + pL.toFixed(3) + (pL < 0.05 ? '★' : '') + ')'
        + '  | 学習 vs 手作り: ' + (effLvsH >= 0 ? '+' : '') + effLvsH.toFixed(1) + 'pt  改善=' + imp + ' 退行=' + reg + ' (符号検定 p=' + p.toFixed(3) + (p < 0.05 ? ' ★有意' : '') + ')';
    }
    console.log(line);
  }
  if (DUMP) {   // ★E38: 同一seed帯で走らせた別AGENTのdumpと tools/compare-dumps.js で直接flip比較できる
    require('fs').writeFileSync(DUMP, JSON.stringify({ agent: AGENT, n: N, seed0: SEED0, date: new Date().toISOString(), pairs: dumpPairs }));
    console.log('  → per-seed dump: ' + DUMP);
  }
  process.exit(0);
})();

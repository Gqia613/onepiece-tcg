#!/usr/bin/env node
/* tools/selfplay-puct.js — Phase2 part2: puct 自己対戦【反復】ループ（崩壊しない強い教師＝puct自身）。
   Stage C は教師=1-ply価値で退行した。ここでは教師を【puctの探索が選んだ手】＝境界価値で評価した手にする。
   1世代:
     1) puct 自己対戦(現 src/ai-policy.js を prior に)で、各アタック判断の【puctが選んだ手】を方策ターゲットに記録(G._puctRecSink)。
        ★self-playは重い(両者探索)ので CHUNK 局ずつ harness を分割実行し、駆動側で JSON を結合（590s上限を回避）。
     2) PyTorch/MPS(pytorch/train.py AZ_POLICY_ONLY=1)で policy を再学習し src/ai-policy.js に反映（value=手作りのまま）。
     3) puct vs heuristic を measure-matchup で測定（新 prior が puct を強くしたか）。
   → 反復: 強くなった prior で再 self-play。価値(≈手作りで最適)は据え置き、priorだけ鍛える＝同じ探索計算で更に強く。
   使い方: node tools/selfplay-puct.js                  （既定2世代×80局・self-play det3/look1/w5・chunk40）
           OPCG_GENS=3 OPCG_GAMES=120 OPCG_SP_DET=4 OPCG_MEASURE_N=40 node tools/selfplay-puct.js
   ★遅い（puct自己対戦＝両者探索）。1世代 数分。
   ★E35(enel単独ローカルAlphaZero): OPCG_TARGET=both＝value+policyを同一世代で共同反復。
     ・OPCG_BOARD=1  … valueを生盤面boardTensor(336次元)入力で学習（AZ_BOARD=1をtrain.pyへ。17次元は手作り同等が実証済みの天井）
     ・OPCG_NOSKIP=1 … self-play/測定ともenelのPUCT_MCTS/SKIPフォールバックを無効化（本物のpuctで打つ・measure-matchupにも伝播）
     ・gating指標: both=学習アーム(value+policy複合候補)の対h flip（同一seed帯なので世代間比較可）
     例: OPCG_TARGET=both OPCG_BOARD=1 OPCG_NOSKIP=1 OPCG_DECKS=enel OPCG_GATE_LEADERS=enel:enel \
         OPCG_GENS=10 OPCG_GAMES=400 OPCG_SP_DET=6 OPCG_SP_LOOK=2 OPCG_SP_WIDTH=6 OPCG_MAXBUF=20000 \
         OPCG_MEASURE_N=60 node tools/selfplay-puct.js */
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { runHarness, runHarnessAsync, ROOT } = require('./../tests/_load-app');

const GENS = +(process.env.OPCG_GENS || 2);
const GAMES = +(process.env.OPCG_GAMES || 80);
const CHUNK = +(process.env.OPCG_SP_CHUNK || 40);                 // 1 harness あたりの self-play 局数（590s上限に収める）
const DET = +(process.env.OPCG_SP_DET || 3), LOOK = +(process.env.OPCG_SP_LOOK || 1), WIDTH = +(process.env.OPCG_SP_WIDTH || 5);
const MEASURE_N = process.env.OPCG_MEASURE_N || '30';
const DECKS_POOL = (process.env.OPCG_DECKS || 'lucy,ace,nami,hancock,teach,enel').split(',').map(s => s.trim()).filter(Boolean);
const DATA = path.join(ROOT, 'pytorch', 'data');
fs.mkdirSync(DATA, { recursive: true });
const PY = path.join(ROOT, 'pytorch', '.venv', 'bin', 'python');

// 1チャンク(n局)を自己対戦し、value/policy/meta を chunkファイルへ書き出す harness
function chunkHarness(seed0, n, valPath, polPath, metaPath) {
  return String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };
const fs = require('fs');
const N = ` + n + `, SEED0 = ` + seed0 + `, LEADERS = ` + JSON.stringify(DECKS_POOL) + `;
const DET = ` + DET + `, LOOK = ` + LOOK + `, WIDTH = ` + WIDTH + `, NOSKIP = ` + (process.env.OPCG_NOSKIP === '1') + `;
const VAL = [], POL = [], WIN = {}; let GI = -1, REC = false;
const _bt = beginTurn;
beginTurn = async function (side) {
  if (REC && !G._sim && G.players.me && G.players.cpu && G.players.me.leader && G.players.cpu.leader) {
    VAL.push({ f: evalFeatures('me'), bf: boardTensor('me'), lk: leaderKeyOf('me'), side: 'me', gi: GI });
    VAL.push({ f: evalFeatures('cpu'), bf: boardTensor('cpu'), lk: leaderKeyOf('cpu'), side: 'cpu', gi: GI });
  }
  return _bt(side);
};
async function playGame(seed, dMe, dCpu) {
  GI++; G.players = {}; G.winner = null; G.inGame = false;
  G._puctDet = DET; G._puctLook = LOOK; G._puctWidth = WIDTH; G._puctNoSkip = NOSKIP;
  seedRng(seed); REC = true; G._puctRecSink = POL;
  startGame(dMe, dCpu);
  G.players.me.isCPU = true; G.players.me.agent = 'puct'; G.players.cpu.agent = 'puct';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  REC = false; G._puctRecSink = null; WIN[GI] = G.winner;
  G._puctDet = null; G._puctLook = null; G._puctWidth = null;
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));
}
(async () => {
  const NL = LEADERS.length;
  for (let i = 0; i < N; i++) await playGame(SEED0 + i, LEADERS[i % NL], LEADERS[(i / NL | 0) % NL]);
  const vrows = [];
  for (const s of VAL) { const w = WIN[s.gi]; if (w !== 'me' && w !== 'cpu') continue; vrows.push({ lk: s.lk, y: w === s.side ? 1 : 0, f: s.f, bf: s.bf }); }
  fs.writeFileSync(` + JSON.stringify(valPath) + `, JSON.stringify(vrows));
  fs.writeFileSync(` + JSON.stringify(polPath) + `, JSON.stringify(POL));
  fs.writeFileSync(` + JSON.stringify(metaPath) + `, JSON.stringify({ evalFeatures: EVAL_FEATURES, polFeat: POL_FEAT, leaderKeys: LEADER_KEYS }));
  console.log('CHUNK value=' + vrows.length + ' policy=' + POL.length);
  process.exit(0);
})();
`;
}

// ★学習対象: policy(=puctのprior, ai-policy.js) / value(=盤面評価, ai-weights.js) / both(=E35: value+policyを同一世代で共同反復)。
const TARGET = process.env.OPCG_TARGET || 'policy';
const ISVAL = TARGET === 'value', ISBOTH = TARGET === 'both';
const KINDS = ISBOTH ? ['value', 'policy'] : [ISVAL ? 'value' : 'policy'];
const F = {
  value: { gvar: 'AI_WEIGHTS', file: path.join(ROOT, 'src', 'ai-weights.js'), out: path.join(ROOT, 'pytorch', 'out', 'ai-weights.js') },
  policy: { gvar: 'AI_POLICY', file: path.join(ROOT, 'src', 'ai-policy.js'), out: path.join(ROOT, 'pytorch', 'out', 'ai-policy.js') },
};
const TRAIN_ENV = ISBOTH ? {} : (ISVAL ? { AZ_VALUE_ONLY: '1' } : { AZ_POLICY_ONLY: '1' });
if (process.env.OPCG_BOARD === '1') TRAIN_ENV.AZ_BOARD = '1';   // ★E35: valueは生盤面boardTensor(336)入力で学習
const MAXBUF = +(process.env.OPCG_MAXBUF || 6000);   // replay buffer のサンプル上限（直近を保持＝発散を抑える）
// ★per-leader gating: リーダーごとに独立に「そのリーダーをheroにした測定で改善した時だけ」その byLeader モデルを採用。
const GATE = (process.env.OPCG_GATE_LEADERS || 'teach:enel,enel:teach').split(',').map(s => s.split(':'));  // hero:villain

// window.<VAR> = {...}; を取り出す（実代入は {" で始まる＝コメントの { feat... } に誤マッチしない）。null可。
function parseAI(kind, p) { const t = fs.readFileSync(p, 'utf8'); const m = t.match(new RegExp('window\\.' + F[kind].gvar + '\\s*=\\s*(\\{"[\\s\\S]*\\})\\s*;')); return m ? JSON.parse(m[1]) : null; }
function writeAI(kind, obj) { fs.writeFileSync(F[kind].file, '/* selfplay-puct.js per-leader gated（手で編集しない） */\nwindow.' + F[kind].gvar + ' = ' + JSON.stringify(obj) + ';\n'); }
// 1リーダー hero を villain 相手に puct vs heuristic 測定 → net。
//   policy: 「対h」flip（AI_WEIGHTSはnull固定なので ai-policy のtrialが効く）。
//   value : 「学習 vs 手作り」flip（measure-matchupは手作りarmでAI_WEIGHTS=null化するので、価値の効果はこちらに出る）。
//   both  : 学習アーム(value+policy複合候補)の対h flip。value未搭載時は手作りアーム対h flip（=同じ複合候補）。同一seed帯なので世代間比較可。
function measureLeader(hero, vill) {
  try {
    const out = cp.execSync('node ' + JSON.stringify(path.join(__dirname, 'measure-matchup.js')),
      { encoding: 'utf8', env: Object.assign({}, process.env, { OPCG_AGENT: 'puct', OPCG_HERO: hero, OPCG_VILLAIN: vill, OPCG_N: MEASURE_N }), timeout: 590000 });
    const line = out.split('\n').filter(l => /vs/.test(l) && /対h/.test(l))[0] || '';
    let m;
    if (ISBOTH) m = line.match(/学習=[\d.]+%\(対h [^ ]+ 改善(\d+)\/退行(\d+)/) || line.match(/改善(\d+)\/退行(\d+)/);
    else if (ISVAL) m = line.match(/改善=(\d+)\s*退行=(\d+)/);
    else m = line.match(/改善(\d+)\/退行(\d+)/);
    return { net: m ? (+m[1] - +m[2]) : 0, str: '    ' + line.trim() };
  } catch (e) { return { net: -999, str: '    (measure失敗 ' + hero + ')' }; }
}

// 1世代の self-play を CHUNK 分割で回し、{vAll,pAll,meta} を返す（データ書き出しは駆動側=replay buffer）
// ★規模拡大: chunk を多コア並列(Promise.all)で実行＝自己対戦の律速を解消。各chunkは別プロセス・別seed帯で独立（状態汚染なし）。
const WORKERS = +(process.env.OPCG_PAR || Math.max(1, os.cpus().length - 1));   // 既定=コア数-1（8コアなら7並列）
// 1チャンクを実行（★失敗は1回リトライ）。スリープ復帰でタイムアウト一斉発火しても全滅せず継続する（同一seed再実行=決定的）。
async function runChunk(g, t) {
  const tag = path.join(os.tmpdir(), 'sppuct-' + g + '-' + t.done + '-' + process.pid);
  const vP = tag + '-v.json', pP = tag + '-p.json', mP = tag + '-m.json';
  for (let at = 1; at <= 2; at++) {
    try {
      const out = await runHarnessAsync('sp-g' + g + '-c' + t.done, chunkHarness(900000 + g * 10000 + t.done, t.n, vP, pP, mP), { timeout: 590000 });
      return { out, vP, pP, mP };
    } catch (e) {
      console.log('  ⚠ ' + new Date().toISOString() + ' chunk c' + t.done + ' 失敗(' + ((e && e.message) || e).toString().slice(0, 120) + ')' + (at === 1 ? ' → リトライ' : ' → 打ち切り'));
      if (at === 2) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
    }
  }
}
async function selfplayGen(g) {
  const tasks = [];
  for (let done = 0; done < GAMES; done += CHUNK) tasks.push({ done, n: Math.min(CHUNK, GAMES - done) });
  const vAll = [], pAll = []; let meta = null;
  for (let i = 0; i < tasks.length; i += WORKERS) {                              // WORKERS 件ずつ並列バッチ
    const results = await Promise.all(tasks.slice(i, i + WORKERS).map(t => runChunk(g, t)));
    for (const r of results) {
      if (!/CHUNK value=/.test(r.out)) { console.error('✗ chunk結果なし\n' + r.out.slice(-400)); process.exit(1); }
      vAll.push(...JSON.parse(fs.readFileSync(r.vP, 'utf8')));
      pAll.push(...JSON.parse(fs.readFileSync(r.pP, 'utf8')));
      meta = JSON.parse(fs.readFileSync(r.mP, 'utf8'));
      for (const f of [r.vP, r.pP, r.mP]) { try { fs.unlinkSync(f); } catch (_) { } }
    }
    console.log('  ' + new Date().toISOString() + ' 世代' + g + ' self-play進行: ' + Math.min(i + WORKERS, tasks.length) + '/' + tasks.length + ' chunk完了');
  }
  return { vAll, pAll, meta };
}

// 現ベスト（value/policy）をファイルへ反映（best無し=committedへ戻す）。self-play/trial測定の前提合わせに使う。
function installBest(committed, best) {
  for (const k of KINDS) { if (best[k]) writeAI(k, best[k]); else fs.writeFileSync(F[k].file, committed[k]); }
}

(async () => {
  console.log('▶ puct自己対戦ループ [target=' + TARGET + ']（' + GENS + '世代 × ' + GAMES + '局・self-play det' + DET + '/look' + LOOK + '/w' + WIDTH + '・chunk' + CHUNK + '・replay+per-leader gating'
    + (process.env.OPCG_NOSKIP === '1' ? '・noSkip' : '') + (TRAIN_ENV.AZ_BOARD ? '・value=board336' : '') + '）');
  const committed = {}, best = {}, cand = {};
  for (const k of KINDS) { committed[k] = fs.readFileSync(F[k].file, 'utf8'); best[k] = parseAI(k, F[k].file); }  // policy=StageB obj / value=null(手作り)
  const bestNet = {};
  if (ISVAL) { for (const [hero] of GATE) bestNet[hero] = 0; console.log('  世代0: value baseline=手作り（学習が手作りを上回る時だけ採用・基準net=0）'); }
  else { console.log('  世代0（現状態）puct:'); for (const [hero, vill] of GATE) { const m = measureLeader(hero, vill); bestNet[hero] = m.net; console.log(m.str + '  [' + hero + ' net=' + m.net + ']'); } }
  const pBuf = [], vBuf = []; let meta = null;             // replay buffer（世代横断）
  for (let g = 1; g <= GENS; g++) {
    installBest(committed, best);                          // self-playは常にベスト（value best無し=手作り）
    const gen = await selfplayGen(g);
    pBuf.push(...gen.pAll); vBuf.push(...gen.vAll); meta = gen.meta;
    if (pBuf.length > MAXBUF) pBuf.splice(0, pBuf.length - MAXBUF);
    if (vBuf.length > MAXBUF) vBuf.splice(0, vBuf.length - MAXBUF);
    fs.writeFileSync(path.join(DATA, 'policy.json'), JSON.stringify(pBuf));
    fs.writeFileSync(path.join(DATA, 'value.json'), JSON.stringify(vBuf));
    fs.writeFileSync(path.join(DATA, 'meta.json'), JSON.stringify(meta));
    console.log('  世代' + g + ' self-play: policy=' + gen.pAll.length + ' value=' + gen.vAll.length + ' / buf=' + (ISVAL ? vBuf.length : pBuf.length));
    try { // train.py は out/ にだけ書く（AZ_INSTALL無し）。駆動側で per-leader にマージ採用。
      cp.execSync(JSON.stringify(PY) + ' ' + JSON.stringify(path.join(ROOT, 'pytorch', 'train.py')),
        { encoding: 'utf8', env: Object.assign({}, process.env, TRAIN_ENV, { AZ_PH: process.env.AZ_PH || '24', AZ_VH: process.env.AZ_VH || '32', AZ_EPOCHS: process.env.AZ_EPOCHS || '500' }), timeout: 590000 });
    } catch (e) { process.stdout.write('  ✗ train.py失敗: ' + ((e.stdout || '') + (e.stderr || '')).slice(-300) + '\n'); process.exit(1); }
    for (const k of KINDS) cand[k] = parseAI(k, F[k].out);
    if (!KINDS.some(k => cand[k] && cand[k].byLeader)) { console.log('  ✗ 世代' + g + ' 学習結果なし（サンプル不足?）'); continue; }
    for (const [hero, vill] of GATE) {
      const kApply = KINDS.filter(k => cand[k] && cand[k].byLeader && cand[k].byLeader[hero]);   // heroの候補がある種別だけ差し替え
      if (!kApply.length) continue;
      for (const k of kApply) {
        const base = best[k] || Object.assign({}, cand[k], { byLeader: {}, default: null });     // value初回: 空byLeader+default null=他リーダー手作り
        writeAI(k, Object.assign({}, base, { byLeader: Object.assign({}, base.byLeader, { [hero]: cand[k].byLeader[hero] }) }));
      }
      const m = measureLeader(hero, vill);
      if (m.net > bestNet[hero]) {
        for (const k of kApply) {
          if (!best[k]) best[k] = Object.assign({}, cand[k], { byLeader: {}, default: null });
          best[k].byLeader[hero] = cand[k].byLeader[hero];
        }
        bestNet[hero] = m.net; console.log('  ✓ 世代' + g + ' [' + hero + '] 採用(' + kApply.join('+') + ' net=' + m.net + '):' + m.str.trim());
      } else { console.log('  ✗ 世代' + g + ' [' + hero + '] 棄却(net=' + m.net + ' <= ' + bestNet[hero] + ')'); }
      installBest(committed, best);                        // trialを戻す（採用済みならbest反映）
    }
  }
  // 最終反映。1つも採用が無い種別は素のファイル（policy=StageB / value=null手作り）に戻す。
  for (const k of KINDS) {
    if (best[k] && Object.keys(best[k].byLeader || {}).length === 0) { fs.writeFileSync(F[k].file, committed[k]); console.log('  ' + k + ': 採用ゼロ→' + F[k].file + ' を元に戻す'); }
    else if (best[k]) writeAI(k, best[k]);
    else fs.writeFileSync(F[k].file, committed[k]);
  }
  console.log('▶ 完了 [target=' + TARGET + ']。per-leader best net: ' + GATE.map(([h]) => h + '=' + bestNet[h]).join(' '));
})();

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
   ★遅い（puct自己対戦＝両者探索）。1世代 数分。 */
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const { runHarness, ROOT } = require('./../tests/_load-app');

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
const DET = ` + DET + `, LOOK = ` + LOOK + `, WIDTH = ` + WIDTH + `;
const VAL = [], POL = [], WIN = {}; let GI = -1, REC = false;
const _bt = beginTurn;
beginTurn = async function (side) {
  if (REC && !G._sim && G.players.me && G.players.cpu && G.players.me.leader && G.players.cpu.leader) {
    VAL.push({ f: evalFeatures('me'), lk: leaderKeyOf('me'), side: 'me', gi: GI });
    VAL.push({ f: evalFeatures('cpu'), lk: leaderKeyOf('cpu'), side: 'cpu', gi: GI });
  }
  return _bt(side);
};
async function playGame(seed, dMe, dCpu) {
  GI++; G.players = {}; G.winner = null; G.inGame = false;
  G._puctDet = DET; G._puctLook = LOOK; G._puctWidth = WIDTH;
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
  for (const s of VAL) { const w = WIN[s.gi]; if (w !== 'me' && w !== 'cpu') continue; vrows.push({ lk: s.lk, y: w === s.side ? 1 : 0, f: s.f }); }
  fs.writeFileSync(` + JSON.stringify(valPath) + `, JSON.stringify(vrows));
  fs.writeFileSync(` + JSON.stringify(polPath) + `, JSON.stringify(POL));
  fs.writeFileSync(` + JSON.stringify(metaPath) + `, JSON.stringify({ evalFeatures: EVAL_FEATURES, polFeat: POL_FEAT, leaderKeys: LEADER_KEYS }));
  console.log('CHUNK value=' + vrows.length + ' policy=' + POL.length);
  process.exit(0);
})();
`;
}

// ★学習対象: policy(=puctのprior, ai-policy.js) か value(=盤面評価, ai-weights.js)。part3で value を追加。
const TARGET = process.env.OPCG_TARGET || 'policy';
const ISVAL = TARGET === 'value';
const GFILE = path.join(ROOT, 'src', ISVAL ? 'ai-weights.js' : 'ai-policy.js');
const GOUT = path.join(ROOT, 'pytorch', 'out', ISVAL ? 'ai-weights.js' : 'ai-policy.js');
const GVAR = ISVAL ? 'AI_WEIGHTS' : 'AI_POLICY';
const TRAIN_ENV = ISVAL ? { AZ_VALUE_ONLY: '1' } : { AZ_POLICY_ONLY: '1' };
const MAXBUF = +(process.env.OPCG_MAXBUF || 6000);   // replay buffer のサンプル上限（直近を保持＝発散を抑える）
// ★per-leader gating: リーダーごとに独立に「そのリーダーをheroにした測定で改善した時だけ」その byLeader モデルを採用。
const GATE = (process.env.OPCG_GATE_LEADERS || 'teach:enel,enel:teach').split(',').map(s => s.split(':'));  // hero:villain

// window.<VAR> = {...}; を取り出す（実代入は {" で始まる＝コメントの { feat... } に誤マッチしない）。null可。
function parseAI(p) { const t = fs.readFileSync(p, 'utf8'); const m = t.match(new RegExp('window\\.' + GVAR + '\\s*=\\s*(\\{"[\\s\\S]*\\})\\s*;')); return m ? JSON.parse(m[1]) : null; }
function writeAI(obj) { fs.writeFileSync(GFILE, '/* selfplay-puct.js per-leader gated（手で編集しない） */\nwindow.' + GVAR + ' = ' + JSON.stringify(obj) + ';\n'); }
// 1リーダー hero を villain 相手に puct vs heuristic 測定 → net。
//   policy: 「対h」flip（AI_WEIGHTSはnull固定なので ai-policy のtrialが効く）。
//   value : 「学習 vs 手作り」flip（measure-matchupは手作りarmでAI_WEIGHTS=null化するので、価値の効果はこちらに出る）。
function measureLeader(hero, vill) {
  try {
    const out = cp.execSync('node ' + JSON.stringify(path.join(__dirname, 'measure-matchup.js')),
      { encoding: 'utf8', env: Object.assign({}, process.env, { OPCG_AGENT: 'puct', OPCG_HERO: hero, OPCG_VILLAIN: vill, OPCG_N: MEASURE_N }), timeout: 590000 });
    const line = out.split('\n').filter(l => /vs/.test(l) && /対h/.test(l))[0] || '';
    const m = ISVAL ? line.match(/改善=(\d+)\s*退行=(\d+)/) : line.match(/改善(\d+)\/退行(\d+)/);
    return { net: m ? (+m[1] - +m[2]) : 0, str: '    ' + line.trim() };
  } catch (e) { return { net: -999, str: '    (measure失敗 ' + hero + ')' }; }
}

// 1世代の self-play を CHUNK 分割で回し、{vAll,pAll,meta} を返す（データ書き出しは駆動側=replay buffer）
function selfplayGen(g) {
  const vAll = [], pAll = []; let meta = null, done = 0;
  while (done < GAMES) {
    const n = Math.min(CHUNK, GAMES - done);
    const tag = path.join(os.tmpdir(), 'sppuct-' + g + '-' + done + '-' + process.pid);
    const vP = tag + '-v.json', pP = tag + '-p.json', mP = tag + '-m.json';
    let out;
    try { out = runHarness('sp-g' + g + '-c' + done, chunkHarness(900000 + g * 10000 + done, n, vP, pP, mP), { timeout: 590000 }); }
    catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
    if (!/CHUNK value=/.test(out)) { console.error('✗ chunk結果なし\n' + out.slice(-400)); process.exit(1); }
    vAll.push(...JSON.parse(fs.readFileSync(vP, 'utf8')));
    pAll.push(...JSON.parse(fs.readFileSync(pP, 'utf8')));
    meta = JSON.parse(fs.readFileSync(mP, 'utf8'));
    for (const f of [vP, pP, mP]) { try { fs.unlinkSync(f); } catch (_) { } }
    done += n;
  }
  return { vAll, pAll, meta };
}

(async () => {
  console.log('▶ puct自己対戦ループ [target=' + TARGET + ']（' + GENS + '世代 × ' + GAMES + '局・self-play det' + DET + '/look' + LOOK + '/w' + WIDTH + '・chunk' + CHUNK + '・replay+per-leader gating）');
  const committed = fs.readFileSync(GFILE, 'utf8');         // 退行時に戻す素のファイル（policy=StageB / value=null）
  let best = parseAI(GFILE);                                // policy: Stage B obj / value: null(手作り)
  const bestNet = {};
  if (ISVAL) { for (const [hero] of GATE) bestNet[hero] = 0; console.log('  世代0: value baseline=手作り（学習が手作りを上回る時だけ採用・基準net=0）'); }
  else { console.log('  世代0（現prior）puct:'); for (const [hero, vill] of GATE) { const m = measureLeader(hero, vill); bestNet[hero] = m.net; console.log(m.str + '  [' + hero + ' net=' + m.net + ']'); } }
  const pBuf = [], vBuf = []; let meta = null;             // replay buffer（世代横断）
  for (let g = 1; g <= GENS; g++) {
    if (best) writeAI(best); else fs.writeFileSync(GFILE, committed);   // self-playは常にベスト（valueはbest=null→手作り）
    const gen = selfplayGen(g);
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
    const cand = parseAI(GOUT);
    if (!cand || !cand.byLeader) { console.log('  ✗ 世代' + g + ' 学習結果なし（サンプル不足?）'); continue; }
    if (!best) best = Object.assign({}, cand, { byLeader: {}, default: null });   // value: 空byLeader+default null = 全リーダー手作りから開始
    for (const [hero, vill] of GATE) {
      if (!cand.byLeader[hero]) continue;
      const trial = Object.assign({}, best, { byLeader: Object.assign({}, best.byLeader, { [hero]: cand.byLeader[hero] }) });
      writeAI(trial);
      const m = measureLeader(hero, vill);
      if (m.net > bestNet[hero]) { best.byLeader[hero] = cand.byLeader[hero]; bestNet[hero] = m.net; console.log('  ✓ 世代' + g + ' [' + hero + '] 採用(net=' + m.net + '):' + m.str.trim()); }
      else { console.log('  ✗ 世代' + g + ' [' + hero + '] 棄却(net=' + m.net + ' <= ' + bestNet[hero] + ')'); }
    }
    writeAI(best);
  }
  // 最終反映。value で1つも採用が無ければ素(null)に戻す。
  if (ISVAL && best && Object.keys(best.byLeader).length === 0) { fs.writeFileSync(GFILE, committed); console.log('  value: 採用ゼロ→' + GFILE + ' を手作り(null)に戻す'); }
  else if (best) writeAI(best);
  console.log('▶ 完了 [target=' + TARGET + ']。per-leader best net: ' + GATE.map(([h]) => h + '=' + bestNet[h]).join(' '));
})();

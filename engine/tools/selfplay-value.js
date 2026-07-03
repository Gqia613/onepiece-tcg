#!/usr/bin/env node
/* tools/selfplay-value.js — AlphaZero自己対戦反復(value)の1巡分のデータ生成。
   生盤面value葉(src/ai-weights.js=inputType:board)の【puct探索】で自己対戦し、各ターン境界の
   boardTensor＋最終勝敗を集める＝「探索が実際に行った局面」のデータ。単発(heuristic分布)は探索で退行→
   探索分布のデータでvalueを再学習し退行が治るかを検証する(=AlphaZeroの本質)。
   出力: pytorch/data/value.json を boardTensor+勝敗で上書き(policy/metaは据え置き)。
   使い方: OPCG_GAMES=120 node tools/selfplay-value.js  (事前に cp pytorch/out/ai-weights.js src/ で生盤面valueを葉に) */
const fs = require('fs'), path = require('path'), os = require('os');
const { runHarnessAsync, ROOT } = require('./../tests/_load-app');
const GAMES = +(process.env.OPCG_GAMES || 120);
const DECKS = (process.env.OPCG_DECKS || 'lucy,ace,nami,hancock,teach,enel').split(',').map(s => s.trim()).filter(Boolean);
const WORKERS = +(process.env.OPCG_PAR || Math.max(1, os.cpus().length - 1));
const OUT = path.join(ROOT, 'pytorch', 'data'); fs.mkdirSync(OUT, { recursive: true });

function chunkHarness(seed, deck, outP) {
  return String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };

const VAL = [];
const _bt = beginTurn;                                       // ターン境界で両者のboardTensorを記録(_sim中=探索内部は除外)
beginTurn = async function (side) {
  if (!G._sim && G.players.me && G.players.cpu && G.players.me.leader && G.players.cpu.leader) {
    VAL.push({ bf: boardTensor('me'),  lk: leaderKeyOf('me'),  side: 'me' });
    VAL.push({ bf: boardTensor('cpu'), lk: leaderKeyOf('cpu'), side: 'cpu' });
  }
  return _bt(side);
};
const DECK = ` + JSON.stringify(deck) + `, SEED = ` + seed + `;
G.players = {}; G.winner = null; G.inGame = false; seedRng(SEED);
startGame(DECK, DECK);
G.players.me.isCPU = true; G.players.cpu.isCPU = true;
G.players.me.agent = 'puct'; G.players.cpu.agent = 'puct';   // ★puct自己対戦(葉=src/ai-weights.js の生盤面value)
G._puctNoSkip = true;                                        // enelもpuctで探索(フォールバックさせない)
G._puctDet = ` + (process.env.OPCG_PUCT_DET || 6) + `; G._puctLook = ` + (process.env.OPCG_PUCT_LOOK || 2) + `; G._puctWidth = ` + (process.env.OPCG_PUCT_WIDTH || 6) + `;  // ★strong(深い探索)=鶏と卵を計算規模で突破
(async () => {
  let it = 0; while (!(G.winner && !G._sim) && it < 2000000) { await new Promise(r => setImmediate(r)); it++; }
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));        // 非決定性ドレイン
  const w = G.winner;
  const rows = (w === 'me' || w === 'cpu') ? VAL.map(s => ({ lk: s.lk, y: w === s.side ? 1 : 0, bf: s.bf })) : [];
  require('fs').writeFileSync(` + JSON.stringify(outP) + `, JSON.stringify({ winner: w, rows: rows }));
  console.log('DONE rows=' + rows.length);
  process.exit(0);
})();
`;
}

(async () => {
  console.log('▶ selfplay-value: ' + GAMES + '局 puct自己対戦(生盤面value葉)→boardTensor+勝敗 (' + WORKERS + '並列)');
  const tasks = []; for (let i = 0; i < GAMES; i++) tasks.push({ seed: 70000 + i, deck: DECKS[i % DECKS.length] });
  const all = []; let nWin = 0;
  for (let i = 0; i < tasks.length; i += WORKERS) {
    const batch = tasks.slice(i, i + WORKERS);
    const res = await Promise.all(batch.map(t => {
      const outP = path.join(os.tmpdir(), 'spv-' + t.seed + '-' + process.pid + '.json');
      return runHarnessAsync('spv-' + t.seed, chunkHarness(t.seed, t.deck, outP), { timeout: 1190000 })
        .then(() => { const d = JSON.parse(fs.readFileSync(outP, 'utf8')); fs.unlinkSync(outP); return d; })
        .catch(e => { process.stdout.write((e.stdout || '') + (e.stderr || '')); return { winner: null, rows: [] }; });
    }));
    for (const d of res) { if (d.winner === 'me' || d.winner === 'cpu') nWin++; all.push(...d.rows); }
    process.stdout.write('  ' + Math.min(i + WORKERS, tasks.length) + '/' + tasks.length + '局 (有効' + nWin + ')\r');
  }
  fs.writeFileSync(path.join(OUT, 'value.json'), JSON.stringify(all));
  console.log('\n  → value.json に ' + all.length + ' サンプル(puct探索分布のboardTensor+勝敗)。次: AZ_BOARD=1で再学習');
  process.exit(0);
})();

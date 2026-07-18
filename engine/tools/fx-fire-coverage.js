#!/usr/bin/env node
/* tools/fx-fire-coverage.js — fx発火カバレッジ計測（「効果自体が発動しない」系統バグの診断ツール）。
   プリセットDECKS全デッキをローテーションで対戦させ（CPU対CPU・heuristic）、カード番号×フック種別
   （onPlay/onAttack/trigger/act/counter/…）ごとの発火回数を数える。
   「手札/盤面に登場した試合があるのに一度もどのフックも発火していないカード」を最重要リストとして出す。
   ★発火ゼロ＝即バグではない（コストが重い/条件が厳しい/CPUが選ばない等）。あくまでトリアージ対象の列挙。

   使い方: node tools/fx-fire-coverage.js                （既定 30試合）
           node tools/fx-fire-coverage.js --games 10     （試合数変更）
           node tools/fx-fire-coverage.js --json         （tools/fx-fire-report.json も出力）
           （任意）--seed0 N / --chunk N

   実装方式（エンジン非改変）: ハーネス内で runFx をラップし、ops参照が ctx.self.base.fx のいずれかの
   フック（配列そのもの or cfg.fx）と一致した時だけ「そのカードのそのフックが発火した」と数える。
   op.then 等のネスト実行は fx フックと参照一致しないので二重計上されない。sim中（G._sim）は数えない。
   登場の計測は beginTurn ラップ＝毎ターン開始時＋試合終了時に両者の 手札/盤面(リーダー/キャラ/ステージ) を走査。 */
const { runHarness } = require('./../tests/_load-app');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return (i >= 0 && args[i + 1] != null) ? +args[i + 1] : d; };
const N = val('--games', 30);
const SEED0 = val('--seed0', 910000);
const CHUNK = Math.max(1, Math.min(val('--chunk', 15), N));
const JSON_OUT = flag('--json');

// 1チャンク分のハーネス。start=通しの試合開始番号 / n=試合数 / emitMeta=デッキ採用カードのメタ出力（初回のみ）
function chunkHarness(start, n, emitMeta) {
  return String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };
const START = ` + start + `, NG = ` + n + `, SEED0 = ` + SEED0 + `, EMIT_META = ` + !!emitMeta + `;
const IDS = DECKS.map(d => d.id);
// ── fx発火の計測: runFx をラップ。ops が self.base.fx のフック本体（配列 or cfg.fx）と参照一致した時のみ計上 ──
const FIRE = {};    // no -> hook -> 発火回数
const APPEAR = {};  // no -> { 試合番号: 1 }（手札/盤面に登場した試合）
let CUR = -1, noWinner = 0;
function hookOf(base, ops) {
  const fx = base.fx; if (!fx) return null;
  for (const k in fx) { const v = fx[k]; if (v === ops) return k; if (v && typeof v === 'object' && !Array.isArray(v) && v.fx === ops) return k; }
  return null;
}
const _runFx = runFx;
runFx = async function (ops, ctx) {
  try {
    if (!G._sim && ops && ctx && ctx.self && ctx.self.base) {
      const h = hookOf(ctx.self.base, ops);
      if (h) { const no = ctx.self.base.no; const m = FIRE[no] = FIRE[no] || {}; m[h] = (m[h] || 0) + 1; }
    }
  } catch (e) { /* 計測失敗はゲームに影響させない */ }
  return _runFx(ops, ctx);
};
// ── 登場の計測: 毎ターン開始時＋試合終了時に 手札/リーダー/キャラ/ステージ を走査（＝使う機会があった試合）──
function scanAppear() {
  if (G._sim || CUR < 0) return;
  for (const s of ['me', 'cpu']) { const P = G.players[s]; if (!P) continue;
    for (const c of [P.leader, P.stage, ...(P.hand || []), ...(P.chars || [])]) if (c && c.base) (APPEAR[c.base.no] = APPEAR[c.base.no] || {})[CUR] = 1; }
}
const _beginTurn = beginTurn;
beginTurn = async function (side) { scanAppear(); return _beginTurn(side); };
// ── 1試合: 通し番号 g からデッキペアをローテーションで決める（全デッキが hero として周回する）──
async function pg(g) {
  const D = IDS.length; const i = g % D; let j = (g + 1 + ((g / D) | 0)) % D; if (j === i) j = (j + 1) % D;
  G.players = {}; G.winner = null; G.inGame = false;
  seedRng(SEED0 + g); CUR = g;
  startGame(IDS[i], IDS[j]);
  G.players.me.isCPU = true; G.players.me.agent = 'heuristic'; G.players.cpu.agent = 'heuristic';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  scanAppear(); CUR = -1;
  if (!G.winner) noWinner++;
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));  // ★保留タスクを消化（次局に漏らさない）
}
(async () => {
  for (let g = START; g < START + NG; g++) await pg(g);
  const appearN = {}; for (const no in APPEAR) appearN[no] = Object.keys(APPEAR[no]).length;
  if (EMIT_META) {  // デッキ採用カードのメタ（フック一覧）。static はrunFxを通らない常在＝計測対象外
    const meta = { deckCount: IDS.length, decks: [], cards: {} };
    for (const d of DECKS) {
      const nos = [d.leader, ...Object.keys(d.list)];
      meta.decks.push({ id: d.id, name: d.name, nos });
      for (const no of nos) { if (meta.cards[no]) continue; const b = C[no] || {}; const hooks = Object.keys(b.fx || {});
        meta.cards[no] = { name: b.name || no, type: b.type || '', hooks, runnable: hooks.filter(k => k !== 'static' && k !== 'onReviveFromTrash') }; }
        // onReviveFromTrash は config型フック（checkReviveTrigger が消費・runFx非経由）＝構造的にカウント不能のため計測対象外（OP16-079で誤検出の実例）
    }
    require('fs').writeSync(1, 'FXMETA ' + JSON.stringify(meta) + '\\n');  // ★console.logだと直後のprocess.exitで8KB超が切れる（パイプ非同期書き込み）
  }
  require('fs').writeSync(1, 'FXCHUNK ' + JSON.stringify({ fire: FIRE, appear: appearN, games: NG, noWinner }) + '\\n');
  process.exit(0);
})();
`;
}

// 出力行からJSONを回収。カード名/テキストに U+2028/U+2029 が混ざると正規表現の . が途中で止まるため indexOf＋\n 区切りで取る
function grabJSON(out, marker) {
  const i = out.indexOf(marker); if (i < 0) return null;
  const j = out.indexOf('\n', i);
  return JSON.parse(out.slice(i + marker.length, j < 0 ? undefined : j));
}

(async () => {
  const t0 = Date.now();
  console.log('▶ fx発火カバレッジ計測（プリセット全デッキ・ローテーション対戦・CPU対CPU heuristic, N=' + N + ' seed0=' + SEED0 + '）');
  const fire = {}, appear = {}; let meta = null, noWinner = 0, done = 0;
  while (done < N) {
    const n = Math.min(CHUNK, N - done);
    let out;
    try { out = runHarness('fxcov', chunkHarness(done, n, done === 0), { timeout: 590000 }); }
    catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
    if (!meta) meta = grabJSON(out, 'FXMETA ');
    const r = grabJSON(out, 'FXCHUNK ');
    if (!r) { console.error('✗ chunk結果なし\n' + out); process.exit(1); }
    for (const no in r.fire) { const m = fire[no] = fire[no] || {}; for (const h in r.fire[no]) m[h] = (m[h] || 0) + r.fire[no][h]; }
    for (const no in r.appear) appear[no] = (appear[no] || 0) + r.appear[no];
    noWinner += r.noWinner; done += n;
    console.log('  … ' + done + '/' + N + ' 試合完了 (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)');
  }
  if (!meta) { console.error('✗ FXMETAなし'); process.exit(1); }

  // ── 集計 ──
  const deckOf = {};  // no -> [デッキ名]
  for (const d of meta.decks) for (const no of d.nos) (deckOf[no] = deckOf[no] || []).push(d.name);
  const rows = [];
  for (const no in meta.cards) {
    const c = meta.cards[no];
    const f = fire[no] || {};
    const totalFired = Object.values(f).reduce((s, x) => s + x, 0);
    rows.push({ no, name: c.name, type: c.type, decks: deckOf[no], hooks: c.hooks, runnable: c.runnable, fired: f, totalFired, appearedGames: appear[no] || 0 });
  }
  const label = (r) => r.no + ' ' + r.name + '  [' + r.decks.join('/') + ']';
  // [A] 登場したのに発火ゼロ（最重要）
  const zeroFire = rows.filter(r => r.runnable.length && r.appearedGames > 0 && r.totalFired === 0)
    .sort((a, b) => b.appearedGames - a.appearedGames);
  // [B] カード自体は発火あり・特定フックだけゼロ
  const hookZero = [];
  for (const r of rows) {
    if (!r.totalFired) continue;
    for (const h of r.runnable) if (!(r.fired[h] > 0)) hookZero.push({ no: r.no, name: r.name, decks: r.decks, hook: h, firedOther: r.fired });
  }
  // [C] 一度も手札/盤面に登場しなかった採用カード（サンプル不足・参考）
  const neverAppeared = rows.filter(r => r.runnable.length && r.appearedGames === 0 && r.totalFired === 0);
  const staticOnly = rows.filter(r => r.hooks.length && !r.runnable.length);
  const noFx = rows.filter(r => !r.hooks.length);

  console.log('  デッキ数=' + meta.deckCount + ' 採用カード種=' + rows.length + '（fxあり=' + rows.filter(r => r.runnable.length).length
    + ' / static常在のみ=' + staticOnly.length + ' / 効果なし=' + noFx.length + '） noWinner=' + noWinner);
  console.log('');
  console.log('── [A] 手札/盤面に登場したのに発火ゼロ（最重要・要トリアージ ' + zeroFire.length + '件）──');
  for (const r of zeroFire) console.log('  ' + label(r) + '  hooks=' + r.runnable.join(',') + '  登場' + r.appearedGames + '試合');
  if (!zeroFire.length) console.log('  （なし）');
  console.log('');
  console.log('── [B] フック別の発火ゼロ（カード自体は別フックで発火あり ' + hookZero.length + '件。trigger/counterは被弾・防御機会依存＝低サンプル注意）──');
  const bMax = 40;
  for (const z of hookZero.slice(0, bMax))
    console.log('  ' + z.no + ' ' + z.name + '  [' + z.decks.join('/') + ']  ' + z.hook + '=0（発火あり: '
      + Object.entries(z.firedOther).map(([k, v]) => k + '=' + v).join(' ') + '）');
  if (hookZero.length > bMax) console.log('  … 他' + (hookZero.length - bMax) + '件（--json で全件）');
  console.log('');
  console.log('── [C] 一度も手札/盤面に登場しなかった採用カード（' + neverAppeared.length + '件・試合数を増やして再計測を推奨）──');
  for (const r of neverAppeared) console.log('  ' + label(r) + '  hooks=' + r.runnable.join(','));
  console.log('');
  console.log('（判定の読み方: [A]発火ゼロ＝即バグではない。コスト/条件/CPUの選好で不発のこともある。cards-fx.js の該当fxと公式テキストの意味照合でトリアージする）');

  if (JSON_OUT) {
    const path = require('path'), fs = require('fs');
    const out = path.join(__dirname, 'fx-fire-report.json');
    fs.writeFileSync(out, JSON.stringify({
      date: new Date().toISOString(), games: N, seed0: SEED0, noWinner,
      decks: meta.decks.map(d => ({ id: d.id, name: d.name, cards: d.nos.length })),
      zeroFire, hookZero, neverAppeared,
      cards: rows.sort((a, b) => a.no < b.no ? -1 : 1),
    }, null, 1));
    console.log('  → JSONレポート: ' + out);
  }
  console.log('  所要 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's（' + ((Date.now() - t0) / 1000 / N).toFixed(1) + 's/試合）');
  process.exit(0);
})();

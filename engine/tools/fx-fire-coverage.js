#!/usr/bin/env node
/* tools/fx-fire-coverage.js — fx発火の質 監査（「テキストは読めているのに発動しない」系統バグの発見ツール）。
   プリセットDECKS全デッキをローテーションで対戦させ（CPU対CPU・heuristic）、カード番号×フック種別ごとに
   発火を分類して数える:
     att = attempted … フック本体の runFx が呼ばれた回数
     com = committed … 呼び出しの前後で盤面状態が変わった（hashGameState差分 or ctx._committed）＝効果が成立した
     dec = declined  … 状態が変わらず ctx._declined（コスト支払い不能/辞退）。CPUは任意効果を辞退しないため、
                       dec の実体はほぼ「コストが払えなかった」
     noop            … 状態が変わらずシグナルも無し（cond不成立・空対象・情報系効果）
     unk             … ネスト呼び出し等で判定不能（参考値）
   ★最重要シグナルは「att>0 なのに com=0」＝呼ばれているのに一度も成立していない。
     紫カタクリL OP11-062 の実バグ（fxは正しいのに支払い基盤 returnDonChoose が裁定違反で不発）はこの型で、
     旧版（runFx呼び出し=発火とカウント）では原理的に捕捉できなかった。
   ★成立ゼロ＝即バグではない（条件が厳しい/コストが重い/情報系/CPUの選好）。あくまでトリアージ候補の列挙。
     [A]の各行の ops 列と cards-fx.js・公式テキスト・ルールFAQ（qa-lookup --rules）を突き合わせて1件ずつ判断する。

   使い方: node tools/fx-fire-coverage.js                （既定 30試合）
           node tools/fx-fire-coverage.js --games 10     （試合数変更）
           node tools/fx-fire-coverage.js --json         （tools/fx-fire-report.json も出力＝前回実行とのdiff用）
           （任意）--seed0 N / --chunk N / --lowrate 0.25 / --minatt 5

   実装方式（エンジン非改変）: ハーネス内で runFx をラップし、ops参照が ctx.self.base.fx のいずれかの
   フック（配列そのもの or cfg.fx）と一致した時だけ計測する。トップレベル呼び出し（G._fxDepth=0）は
   hashGameState の前後差分で成立を判定、ネスト呼び出し（登場連鎖のonPlay等）は ctx シグナルのみ（無ければ unk）。
   op.then のネスト実行は fx フックと参照一致しないので二重計上されない。sim中（G._sim）は数えない。
   登場の計測は beginTurn ラップ＝毎ターン開始時＋試合終了時に両者の 手札/盤面(リーダー/キャラ/ステージ) を走査。 */
const { runHarness } = require('./../tests/_load-app');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => { const i = args.indexOf(n); return (i >= 0 && args[i + 1] != null) ? +args[i + 1] : d; };
const N = val('--games', 30);
const SEED0 = val('--seed0', 910000);
const CHUNK = Math.max(1, Math.min(val('--chunk', 15), N));
const JSON_OUT = flag('--json');
const LOWRATE = val('--lowrate', 0.25);   // [B] 低成立率の閾値（com/att がこれ未満）
const MINATT = val('--minatt', 5);        // [B] の最低試行回数（低サンプルのノイズ抑制）
// ★ユーザーのマイデッキ監査（②）: tools/user-decks.json（D1のマイデッキのスナップショット）があれば自動で読み込み、
//   ヒーロー側をマイデッキの固定回転・相手側をプリセット回転にする＝「実際に使うカード」に発火サンプルを集中させる。
//   紫カタクリLの実バグは非プリセットデッキで起きた＝プリセットのみの監査では原理的に届かなかった穴を塞ぐ。
//   スナップショット更新: npx wrangler d1 execute opcg --remote --json --command
//     "SELECT d.name,d.leader,d.list FROM decks d JOIN users u ON u.id=d.user_id WHERE u.username='michiru';"
//   → [{id:'userN', name:'マイデッキ:…', leader, list}] 形式で tools/user-decks.json へ（--deckfile で別ファイル指定・--nouser で無効化）。
const fsMod = require('fs'), pathMod = require('path');
const DECKFILE = (() => { const i = args.indexOf('--deckfile'); if (i >= 0 && args[i + 1]) return args[i + 1]; const d = pathMod.join(__dirname, 'user-decks.json'); return (!flag('--nouser') && fsMod.existsSync(d)) ? d : null; })();
const CUSTOM_DECKS = DECKFILE ? JSON.parse(fsMod.readFileSync(DECKFILE, 'utf8')) : [];

// 「情報を見るだけで状態が変わらないのが正常」なop（no-op が正当）。[A]から情報系として分離する。
const INFO_OPS = new Set(['peekOppDeck', 'peekLifeTopPlace', 'scry', 'revealTop']);

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
const CUSTOM = ` + JSON.stringify(CUSTOM_DECKS) + `;
for (const d of CUSTOM) if (!DECKS.some(x => x.id === d.id)) DECKS.push(d); // マイデッキをDECKSに合流（meta/計測が同じ経路を通る）
const UIDS = CUSTOM.map(d => d.id);
const IDS = DECKS.filter(d => !UIDS.includes(d.id)).map(d => d.id);
// ── fx発火の質: runFx をラップ。ops が self.base.fx のフック本体（配列 or cfg.fx）と参照一致した時のみ計測 ──
const FIRE = {};    // no -> hook -> {att,com,dec,noop,unk}
const APPEAR = {};  // no -> { 試合番号: 1 }（手札/盤面に登場した試合）
let CUR = -1, noWinner = 0;
function hookOf(base, ops) {
  const fx = base.fx; if (!fx) return null;
  for (const k in fx) { const v = fx[k]; if (v === ops) return k; if (v && typeof v === 'object' && !Array.isArray(v) && v.fx === ops) return k; }
  return null;
}
const _runFx = runFx;
runFx = async function (ops, ctx) {
  let st = null, top0 = false, pre = null;
  try {
    if (!G._sim && ops && ctx && ctx.self && ctx.self.base) {
      const h = hookOf(ctx.self.base, ops);
      if (h) {
        const no = ctx.self.base.no; const m = FIRE[no] = FIRE[no] || {};
        st = m[h] = m[h] || { att: 0, com: 0, dec: 0, noop: 0, unk: 0 };
        st.att++;
        top0 = !G._fxDepth;  // トップレベル呼び出しだけ hash 前後差分で成立を判定できる
        if (top0) { try { pre = hashGameState(G); } catch (e) { pre = null; } }
      }
    }
  } catch (e) { st = null; /* 計測失敗はゲームに影響させない */ }
  const r = await _runFx(ops, ctx);
  try {
    if (st) {
      const sigCom = !!(ctx && ctx._committed), sigDec = !!(ctx && ctx._declined);
      if (top0 && pre != null) {
        let post = null; try { post = hashGameState(G); } catch (e) { post = null; }
        if (post != null && post !== pre) st.com++;       // 状態が変わった＝成立
        else if (sigCom) st.com++;                        // hash不変でも明示commit（保険）
        else if (sigDec) st.dec++;                        // コスト不能/辞退
        else st.noop++;                                   // cond不成立・空対象・情報系
      } else if (sigCom) st.com++;
      else if (sigDec) st.dec++;
      else st.unk++;                                      // ネスト＆シグナル無し＝判定不能
    }
  } catch (e) { /* 計測失敗はゲームに影響させない */ }
  return r;
};
// ── 登場の計測: 毎ターン開始時＋試合終了時に 手札/リーダー/キャラ/ステージ を走査（＝使う機会があった試合）──
function scanAppear() {
  if (G._sim || CUR < 0) return;
  for (const s of ['me', 'cpu']) { const P = G.players[s]; if (!P) continue;
    for (const c of [P.leader, P.stage, ...(P.hand || []), ...(P.chars || [])]) if (c && c.base) (APPEAR[c.base.no] = APPEAR[c.base.no] || {})[CUR] = 1; }
}
const _beginTurn = beginTurn;
beginTurn = async function (side) { scanAppear(); return _beginTurn(side); };
// ── 1試合: 通し番号 g からデッキペアを決める。マイデッキがあればヒーロー=マイデッキ固定回転×相手=プリセット回転
//   （実使用カードにサンプル集中）。無ければ従来のプリセット全周回。──
async function pg(g) {
  let heroId, villId;
  if (UIDS.length) { heroId = UIDS[g % UIDS.length]; villId = IDS[((g / UIDS.length) | 0) % IDS.length]; }
  else { const D = IDS.length; const i = g % D; let j = (g + 1 + ((g / D) | 0)) % D; if (j === i) j = (j + 1) % D; heroId = IDS[i]; villId = IDS[j]; }
  G.players = {}; G.winner = null; G.inGame = false;
  seedRng(SEED0 + g); CUR = g;
  startGame(heroId, villId);
  G.players.me.isCPU = true; G.players.me.agent = 'heuristic'; G.players.cpu.agent = 'heuristic';
  let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
  scanAppear(); CUR = -1;
  if (!G.winner) noWinner++;
  for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));  // ★保留タスクを消化（次局に漏らさない）
}
(async () => {
  for (let g = START; g < START + NG; g++) await pg(g);
  const appearN = {}; for (const no in APPEAR) appearN[no] = Object.keys(APPEAR[no]).length;
  if (EMIT_META) {  // デッキ採用カードのメタ（フック一覧＋トリアージ用のop名）。static はrunFxを通らない常在＝計測対象外
    const meta = { deckCount: DECKS.length, userDecks: UIDS.length, decks: [], cards: {} };
    for (const d of DECKS) {
      const nos = [d.leader, ...Object.keys(d.list)];
      meta.decks.push({ id: d.id, name: d.name, nos });
      for (const no of nos) { if (meta.cards[no]) continue; const b = C[no] || {}; const hooks = Object.keys(b.fx || {});
        const opsOf = {};
        for (const k of hooks) { if (k === 'static') continue; const v = b.fx[k]; const arr = Array.isArray(v) ? v : ((v && v.fx) || []);
          opsOf[k] = arr.map(o => { let s = o.op || '?'; const sub = (o.then || []).map(t => t.op).join('+'); if (sub) s += '(' + sub + ')'; if (o.cpuSkip) s += '[cpuSkip]'; return s; }); }
        meta.cards[no] = { name: b.name || no, type: b.type || '', hooks, runnable: hooks.filter(k => k !== 'static' && k !== 'onReviveFromTrash'), ops: opsOf }; }
        // onReviveFromTrash は config型フック（checkReviveTrigger が消費・runFx非経由）＝構造的にカウント不能のため計測対象外（OP16-079で誤検出の実例）
    }
    require('fs').writeSync(1, 'FXMETA ' + JSON.stringify(meta) + '\\n');  // ★console.logだと直後のprocess.exitで8KB超が切れる（パイプ非同期書き込み）。★このセグメントは+連結で通常テンプレート＝\\nと二重に書く
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

const Z = () => ({ att: 0, com: 0, dec: 0, noop: 0, unk: 0 });
const fmt = (s) => 'att=' + s.att + ' com=' + s.com + ' dec=' + s.dec + ' noop=' + s.noop + (s.unk ? ' unk=' + s.unk : '');
// opsの文字列列（'donMinus(peekOppDeck+leaderBuff)' 等）から素のop名を抽出し、cond以外が全て情報系かを判定
function isInfoOnly(opsList) {
  const names = (opsList || []).join(' ').match(/[A-Za-z]+/g) || [];
  const eff = names.filter(n => n !== 'cond');
  return eff.length > 0 && eff.every(n => INFO_OPS.has(n));
}

(async () => {
  const t0 = Date.now();
  console.log('▶ fx発火の質 監査（att/com/dec/noop分類・CPU対CPU heuristic, N=' + N + ' seed0=' + SEED0 + (CUSTOM_DECKS.length ? ' ★マイデッキ' + CUSTOM_DECKS.length + '個をヒーロー固定回転×プリセット相手' : ' プリセット全デッキ・ローテーション') + '）');
  const fire = {}, appear = {}; let meta = null, noWinner = 0, done = 0;
  while (done < N) {
    const n = Math.min(CHUNK, N - done);
    let out;
    try { out = runHarness('fxcov', chunkHarness(done, n, done === 0), { timeout: 590000 }); }
    catch (e) { process.stdout.write((e.stdout || '') + (e.stderr || '')); process.exit(1); }
    if (!meta) meta = grabJSON(out, 'FXMETA ');
    const r = grabJSON(out, 'FXCHUNK ');
    if (!r) { console.error('✗ chunk結果なし\n' + out); process.exit(1); }
    for (const no in r.fire) { const m = fire[no] = fire[no] || {}; for (const h in r.fire[no]) { const t = m[h] = m[h] || Z(); const s = r.fire[no][h]; for (const k in s) t[k] = (t[k] || 0) + (s[k] || 0); } }
    for (const no in r.appear) appear[no] = (appear[no] || 0) + r.appear[no];
    noWinner += r.noWinner; done += n;
    console.log('  … ' + done + '/' + N + ' 試合完了 (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)');
  }
  if (!meta) { console.error('✗ FXMETAなし'); process.exit(1); }

  // ── 集計 ──
  const deckOf = {};  // no -> [デッキ名]
  for (const d of meta.decks) for (const no of d.nos) (deckOf[no] = deckOf[no] || []).push(d.name);
  const tierA = [], tierB = [], hookZero = [], infoRows = [], unkOnly = [];
  const cardRows = [];
  for (const no in meta.cards) {
    const c = meta.cards[no];
    if (!c.runnable.length) { cardRows.push({ no, name: c.name, type: c.type, decks: deckOf[no], hooks: c.hooks, runnable: [], stats: {}, appearedGames: appear[no] || 0 }); continue; }
    const stats = {};
    let anyAtt = false;
    for (const h of c.runnable) { const s = (fire[no] && fire[no][h]) || Z(); stats[h] = s; if (s.att > 0) anyAtt = true; }
    cardRows.push({ no, name: c.name, type: c.type, decks: deckOf[no], hooks: c.hooks, runnable: c.runnable, ops: c.ops, stats, appearedGames: appear[no] || 0 });
    for (const h of c.runnable) {
      const s = stats[h]; const opsList = (c.ops && c.ops[h]) || [];
      const row = { no, name: c.name, decks: deckOf[no], hook: h, s, ops: opsList.join(','), appeared: appear[no] || 0 };
      if (s.att === 0) { if ((appear[no] || 0) > 0) hookZero.push({ ...row, cardAnyAtt: anyAtt }); continue; }
      const judged = s.com === 0 && (s.dec + s.noop) > 0;    // 分類済みの試行が全て不成立
      if (judged) {
        if (isInfoOnly(opsList)) infoRows.push(row);
        else tierA.push({ ...row, reason: s.dec === s.att ? '全て辞退シグナル(コスト不能/cond不成立/辞退)' : s.noop === s.att ? '全てno-op(空対象/cpuSkip/シグナル無し)' : '混在' });
      } else if (s.com === 0 && s.att === s.unk) unkOnly.push(row);  // 全部ネスト＝判定不能（JSONのみ）
      else if (s.att >= MINATT && s.com / s.att < LOWRATE) tierB.push({ ...row, rate: (100 * s.com / s.att).toFixed(0) + '%' });
    }
  }
  tierA.sort((a, b) => b.s.att - a.s.att);
  tierB.sort((a, b) => (a.s.com / a.s.att) - (b.s.com / b.s.att));
  const zeroCard = [], zeroHook = [];
  for (const z of hookZero) (z.cardAnyAtt ? zeroHook : zeroCard).push(z);
  const seenZC = new Set(); const zeroCardU = zeroCard.filter(z => !seenZC.has(z.no) && seenZC.add(z.no));
  const neverAppeared = cardRows.filter(r => r.runnable.length && r.appearedGames === 0);
  const staticOnly = cardRows.filter(r => r.hooks.length && !r.runnable.length);
  const noFx = cardRows.filter(r => !r.hooks.length);

  console.log('  デッキ数=' + meta.deckCount + (meta.userDecks ? '(うちマイデッキ' + meta.userDecks + ')' : '') + ' 採用カード種=' + cardRows.length + '（fxあり=' + cardRows.filter(r => r.runnable.length).length
    + ' / static常在のみ=' + staticOnly.length + ' / 効果なし=' + noFx.length + '） noWinner=' + noWinner);
  console.log('');
  console.log('── [A] 呼ばれるのに一度も成立しない（att>0, com=0。最優先トリアージ ' + tierA.length + '件）──');
  for (const r of tierA) console.log('  ' + r.no + ' ' + r.name + '  [' + r.decks.join('/') + ']  ' + r.hook + '  ' + fmt(r.s) + '  ← ' + r.reason + '  ops:' + r.ops);
  if (!tierA.length) console.log('  （なし）');
  console.log('');
  console.log('── [B] 成立率が低い（att≥' + MINATT + ', com/att<' + (LOWRATE * 100) + '%。' + tierB.length + '件）──');
  for (const r of tierB) console.log('  ' + r.no + ' ' + r.name + '  [' + r.decks.join('/') + ']  ' + r.hook + '  成立率' + r.rate + '  ' + fmt(r.s) + '  ops:' + r.ops);
  if (!tierB.length) console.log('  （なし）');
  console.log('');
  console.log('── [C1] 登場したのに全フック未到達（att=0。旧・発火ゼロ ' + zeroCardU.length + '件）──');
  for (const r of zeroCardU) console.log('  ' + r.no + ' ' + r.name + '  [' + r.decks.join('/') + ']  登場' + r.appeared + '試合  ops:' + r.ops);
  if (!zeroCardU.length) console.log('  （なし）');
  console.log('');
  console.log('── [C2] 特定フックのみ未到達（カード自体は別フックで試行あり ' + zeroHook.length + '件。trigger/counterは被弾・防御機会依存＝低サンプル注意）──');
  const c2Max = 40;
  for (const z of zeroHook.slice(0, c2Max)) console.log('  ' + z.no + ' ' + z.name + '  [' + z.decks.join('/') + ']  ' + z.hook + '=未到達  ops:' + z.ops);
  if (zeroHook.length > c2Max) console.log('  … 他' + (zeroHook.length - c2Max) + '件（--json で全件）');
  console.log('');
  console.log('── [情報系] no-opが正常のフック（peek/scry等・com=0でも正当 ' + infoRows.length + '件・参考）──');
  for (const r of infoRows.slice(0, 10)) console.log('  ' + r.no + ' ' + r.name + '  ' + r.hook + '  ' + fmt(r.s) + '  ops:' + r.ops);
  console.log('');
  console.log('── [D] 一度も手札/盤面に登場しなかった採用カード（' + neverAppeared.length + '件・試合数を増やして再計測を推奨）──');
  for (const r of neverAppeared) console.log('  ' + r.no + ' ' + r.name + '  [' + r.decks.join('/') + ']');
  console.log('');
  console.log('（読み方: [A]=紫カタクリ型の最有力候補。dec=辞退シグナル（cond不成立も_declinedを立てる仕様＝コスト不能と混在）、noop=シグナル無し（空対象/cpuSkip設計等）。');
  console.log('  正常が混ざる: cond不成立で不発は正常・[cpuSkip]はCPUが意図的に使わない設計・イベントmainのdecは「CPUが払えないコストのイベントを無駄撃ち」の疑い（AI品質）。');
  console.log('  即バグ断定はせず cards-fx.js の該当fx・公式テキスト・ルールFAQ(qa-lookup --rules)と意味照合してトリアージする）');

  if (JSON_OUT) {
    const path = require('path'), fs = require('fs');
    const out = path.join(__dirname, 'fx-fire-report.json');
    fs.writeFileSync(out, JSON.stringify({
      date: new Date().toISOString(), games: N, seed0: SEED0, noWinner,
      decks: meta.decks.map(d => ({ id: d.id, name: d.name, cards: d.nos.length })),
      tierA, tierB, zeroCard: zeroCardU, zeroHook, infoRows, unkOnly,
      neverAppeared: neverAppeared.map(r => ({ no: r.no, name: r.name, decks: r.decks })),
      cards: cardRows.sort((a, b) => a.no < b.no ? -1 : 1),
    }, null, 1));
    console.log('  → JSONレポート: ' + out + '（前回実行とのdiffで回帰検知にも使える）');
  }
  console.log('  所要 ' + ((Date.now() - t0) / 1000).toFixed(0) + 's（' + ((Date.now() - t0) / 1000 / N).toFixed(1) + 's/試合）');
  process.exit(0);
})();

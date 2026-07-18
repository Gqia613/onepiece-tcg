#!/usr/bin/env node
/* tools/lint-fx.js — カード効果(fx)の静的リント。「静かに不発」になる決定的な実装ミスを機械検出する。
   使い方: node tools/lint-fx.js            … 全カード
           node tools/lint-fx.js ST36 OP16  … セット指定（番号接頭辞）
           node tools/lint-fx.js --json     … tools/lint-report.json も生成
   ERROR（=確実に不発・誤動作。終了コード1）:
     E1 unknown-op   … fx内（then/else/fx/配列ネスト含む全階層）の op 名がエンジンsrcのどこにも存在しない
                       （doOpのcase ∪ src全体の .op 比較サイト。unknown opはdoOpのdefault:breakで無言スキップ）
                       ※redirect等、doOp外で解釈されるopがあるため和集合で照合（誤ERRORゼロを優先）
     E2 unknown-hook … fxトップレベルキーがエンジンsrcのどこからも参照されない（typo→永久に不発）
     E3 broken-ref   … cards-fx.js の別番号参照(Rマップ)の指す先が無い/未反映、または CARD_FX キーがDBに無い番号
     E4 then-dropped … op が then を持つのに doOp の case が op.then を実行しない（コストだけ払って効果不発。donMinus 19枚の実例）
   WARN（official-full.json の text/trigger との突合ヒューリスティック。誤検知あり=要トリアージ一覧）:
     W1 optional漏れ … 任意マーカー（てもよい/することができる/N枚まで）があるのに fx に optional が無い
                       ノイズ抑制: ドン操作系（上限まで自動＝設計近似）／コスト句「できる：」＋コスト系op／
                                   「登場させ」＋playFromDeck系（選択UIが素で辞退可能）
     W2 once漏れ     … 【ターン1回】/【ゲーム1回】があるのに fx に once が無い
                       ノイズ抑制: 【起動メイン】直後の【ターン1回】は actOnce() がテキスト正本で自動処理
     W3 リーダー対象漏れ … 「リーダーか（または）キャラ」対象句があるのに fx がリーダーに一切言及しない
                       ノイズ抑制: donAttach（既定候補にリーダー内蔵）／条件句「〜がいる場合」
   語彙（有効op名・有効フック名）はエンジンsrcから動的抽出＝エンジン側の追加に自動追従。cards-fx.js/src は一切修正しない。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── 読み込み（audit-cards.js と同方式） ──────────────────────
const official = JSON.parse(rd('tools/official-full.json'));
const ctx = { window: {}, console };
for (const f of ['cards.js', 'cards-fx.js', 'cards-attr.js']) vm.runInNewContext(rd(f), ctx, { filename: f });
vm.runInNewContext(rd('src/00-data.js') + '\n;window.__C=(typeof C!=="undefined")?C:null;', ctx, { filename: '00-data.js' });
const C = ctx.window.__C, CARD_FX = ctx.window.CARD_FX;
if (!C || !CARD_FX) { console.error('読み込み失敗: C/CARD_FX'); process.exit(1); }

// ── エンジンsrcから語彙を動的抽出 ──────────────────────────
const srcFiles = fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js'));
const srcAll = srcFiles.map(f => rd('src/' + f)).join('\n');

// op語彙: doOp の case（正本）＋ src全体の「.op 比較サイト」（static系・redirect等doOp外の解釈者）
const DOOP_OPS = new Set();
{
  const tf = rd('src/20-targeting-fx.js');
  const st = tf.indexOf('switch (op.op)');
  const body = st >= 0 ? tf.slice(st) : tf;
  for (const m of body.matchAll(/case '([A-Za-z0-9_]+)':/g)) DOOP_OPS.add(m[1]);
}
const CMP_OPS = new Set();
for (const m of srcAll.matchAll(/\.op\s*[!=]==?\s*'([A-Za-z0-9_]+)'/g)) CMP_OPS.add(m[1]);
for (const m of srcAll.matchAll(/'([A-Za-z0-9_]+)'\s*[!=]==?\s*[A-Za-z_$.[\]]+\.op\b/g)) CMP_OPS.add(m[1]);
for (const m of srcAll.matchAll(/\[((?:'[A-Za-z0-9_]+'(?:,\s*)?)+)\]\.includes\([A-Za-z_$.[\]]*\.op\)/g))
  for (const x of m[1].matchAll(/'([A-Za-z0-9_]+)'/g)) CMP_OPS.add(x[1]);
const KNOWN_OPS = new Set([...DOOP_OPS, ...CMP_OPS]);

// E4語彙: doOp caseの本文が op.then を参照するop（then消費者）。fall-through（空case）は次caseの本文を継承
const THEN_OK = new Set();
{
  const tf = rd('src/20-targeting-fx.js');
  const st = tf.indexOf('switch (op.op)');
  const body = st >= 0 ? tf.slice(st) : tf;
  const cs = [...body.matchAll(/case '([A-Za-z0-9_]+)':/g)];
  const segs = cs.map((m, i) => body.slice(m.index + m[0].length, i + 1 < cs.length ? cs[i + 1].index : undefined));
  for (let i = cs.length - 1; i >= 0; i--) {
    const own = /op\.then/.test(segs[i]);
    const fallThrough = segs[i].trim().length < 5 && i + 1 < cs.length && THEN_OK.has(cs[i + 1][1]);
    if (own || fallThrough) THEN_OK.add(cs[i][1]);
  }
}

// 有効フック名: エンジンsrcの .fx.XXX 参照 + fireSimpleReact('key') + 00-data.js のメタキー(fxe.XXX)
const JS_BUILTIN = new Set(['length', 'push', 'pop', 'some', 'every', 'filter', 'map', 'slice', 'forEach', 'find', 'includes', 'indexOf', 'concat', 'join', 'sort', 'shift', 'unshift', 'reduce', 'keys', 'entries', 'hasOwnProperty', 'call', 'apply', 'bind', 'toString']);
const HOOKS = new Set();
for (const m of srcAll.matchAll(/\.fx\.([A-Za-z_$][A-Za-z0-9_$]*)/g)) if (!JS_BUILTIN.has(m[1])) HOOKS.add(m[1]);
for (const m of srcAll.matchAll(/fireSimpleReact\(\s*[^,()]+,\s*'([A-Za-z0-9_]+)'/g)) HOOKS.add(m[1]);
for (const m of rd('src/00-data.js').matchAll(/fxe\.([A-Za-z0-9_]+)/g)) if (!JS_BUILTIN.has(m[1])) HOOKS.add(m[1]);

// ── セット指定 ──────────────────────────────────────────
const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const sets = args.filter(a => a !== '--json');
const setOf = no => (no.match(/^(OP\d+|EB\d+|PRB\d+|ST\d+)-/) || [])[1] || (no.match(/^(P)-/) ? 'P' : 'OTHER');
const inScope = no => !sets.length || sets.includes(setOf(no));

// ── ERROR: E1 unknown-op / E2 unknown-hook（再帰走査） ──────────
const errors = []; // {no,code,where,detail}
const err = (no, code, where, detail) => errors.push({ no, code, where, detail });

function walkOps(no, node, pathStr, opNames) {
  if (Array.isArray(node)) { node.forEach((v, i) => walkOps(no, v, `${pathStr}[${i}]`, opNames)); return; }
  if (!node || typeof node !== 'object') return;
  if (typeof node.op === 'string') {
    opNames.add(node.op);
    if (!KNOWN_OPS.has(node.op)) err(no, 'E1 unknown-op', pathStr, `op:"${node.op}" はdoOpのcaseにもsrcの.op比較サイトにも存在しない`);
    // E4: thenを持つのにdoOp caseがop.thenを実行しない＝コストだけ払って効果不発の型（donMinus 19枚の実例）。
    //     doOp外解釈のop（CMP_OPS）は消費箇所を静的特定できないため対象外
    if (Array.isArray(node.then) && DOOP_OPS.has(node.op) && !CMP_OPS.has(node.op) && !THEN_OK.has(node.op))
      err(no, 'E4 then-dropped', pathStr, `op:"${node.op}" のdoOp caseはop.thenを実行しない（支払いのみで効果不発）`);
  }
  for (const k in node) { const v = node[k]; if (v && typeof v === 'object') walkOps(no, v, `${pathStr}.${k}`, opNames); }
}

const opNamesByNo = {}; // no → Set(使用op名)。W3のリーダー内蔵op判定で再利用
for (const no in CARD_FX) {
  if (!inScope(no)) continue;
  // E3: CARD_FXのキーがカードDBに無い番号（typo→そのfxは永久に未適用）
  if (!C[no]) { err(no, 'E3 broken-ref', '(キー)', 'CARD_FXのキーがカードDBに存在しない番号'); continue; }
  const fx = CARD_FX[no], names = opNamesByNo[no] = new Set();
  for (const hook in fx) {
    if (!HOOKS.has(hook)) err(no, 'E2 unknown-hook', hook, `フック"${hook}"はエンジンsrcのどこからも参照されない`);
    walkOps(no, fx[hook], hook, names);
  }
}

// E3: 別番号参照マップ R（cards-fx.js内の `var R = {...}` → 参照コピー）。指す先が無い/定義位置が後ろで未反映を検出
{
  const raw = rd('cards-fx.js');
  const m = raw.match(/var R = \{([\s\S]*?)\};\s*for \(var k in R\)/);
  if (m) {
    for (const p of m[1].matchAll(/"([A-Za-z0-9_-]+)"\s*:\s*"([A-Za-z0-9_-]+)"/g)) {
      const [, from, to] = p;
      if (!inScope(from)) continue;
      if (!CARD_FX[to]) { err(from, 'E3 broken-ref', `R→${to}`, '参照先のFXエントリが存在しない'); continue; }
      const src = CARD_FX[to], dst = CARD_FX[from];
      if (!dst) { err(from, 'E3 broken-ref', `R→${to}`, '参照コピーが未反映（参照先の定義位置がRブロックより後ろ）'); continue; }
      for (const k in src) if (k !== 'trigger' && !(k in dst)) err(from, 'E3 broken-ref', `R→${to}.${k}`, `参照先のフック"${k}"が未反映`);
    }
  }
}

// ── WARN: 公式テキストとの突合ヒューリスティック ──────────────
// audit-cards.js と同じ除外: キーワードのみ／fxでなくエンジンにハードコードされたリーダー
const keywordOnly = t => {
  let s = (t || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').replace(/\([^)]*\)/g, '');
  s = s.replace(/【速攻】|【ブロッカー】|【バニッシュ】|【ダブルアタック】|【キャラ速攻】/g, '');
  s = s.replace(/ルール上、このカードはデッキに何枚でも入れる(こと|事)ができる。?/g, '');
  s = s.replace(/ルール上、このカードはカード名を「[^」]+」としても扱う。?/g, '');
  return s === '';
};
const HARDCODED = { 'OP15-002': 1, 'OP15-058': 1, 'OP16-080': 1 }; // lucy/enel/teach（エンジン本体実装）
// 既定の対象候補にリーダーを内蔵しているop（donAttachのchooseOwnプール・restDonForBuffのプールは[リーダー,...キャラ]）
const LEADER_NATIVE_OPS = new Set(['donAttach', 'restDonForBuff']);
// 選択UIが素で辞退可能なop＝doOpのcase本体が chooseCard/chooseFromHand に optional=true 定数を渡す、
// または「（任意）」ラベル／showPromptの辞退肢（加えない・見ない等）を持つもの。
// これらは optional 指定が無くても人間は辞退できる＝W1の実害なし（op.optional 依存のopはリストに入らない＝検出対象のまま）
const NATIVE_DECLINE_OPS = (() => {
  const set = new Set();
  const tf = rd('src/20-targeting-fx.js');
  const body = tf.slice(tf.indexOf('switch (op.op)'));
  const idx = [...body.matchAll(/case '([A-Za-z0-9_]+)':/g)];
  for (let i = 0; i < idx.length; i++) {
    const seg = body.slice(idx[i].index, i + 1 < idx.length ? idx[i + 1].index : body.length);
    if (/（任意）|'加えない'|'見ない'|'発動しない'|'使わない'/.test(seg) || /(chooseCard|chooseFromHand)\((?:[^;]{0,300}?),\s*true\s*[,)]/.test(seg)) set.add(idx[i][1]);
  }
  return set;
})();

const warns = []; // {no,code,evidence}
const warn = (no, code, evidence) => warns.push({ no, code, evidence });
const clip = (t, i, len) => t.slice(Math.max(0, i - 14), i + len + 12).replace(/\s+/g, '');

for (const o of official) {
  const no = o.no;
  if (/_r\d+$/.test(no)) continue;              // パラレルは本体fxを継承＝本体だけ見る
  if (!inScope(no) || HARDCODED[no]) continue;
  const fx = CARD_FX[no];
  if (!fx) continue;                            // fx未実装は audit の fx_missing 管轄
  const text = (o.text || '') + ' ' + (o.trigger || '');
  if (keywordOnly(text)) continue;
  const fxs = JSON.stringify(fx);
  const opNames = opNamesByNo[no] || new Set();

  // W1 optional漏れ（マーカー出現ごとに文脈でノイズ抑制）
  if (!/"optional"/.test(fxs) && !/"chooseOption"/.test(fxs) && ![...opNames].some(n => NATIVE_DECLINE_OPS.has(n))) {
    for (const m of text.matchAll(/てもよい|することができる|[0-9０-９]枚まで/g)) {
      const w = text.slice(Math.max(0, m.index - 16), m.index + m[0].length + 10);
      if (/ドン/.test(w)) continue;                                            // ドン操作系opは上限まで自動（設計近似）
      if (/できる[：:]/.test(w) && /Cost"/.test(fxs)) continue;               // コスト句「できる：」＝コスト系opは素で辞退可能
      warn(no, 'W1 optional漏れ', clip(text, m.index, m[0].length)); break;
    }
  }

  // W2 once漏れ（【起動メイン】直後の【ターン1回】は actOnce() がテキスト正本で自動処理＝除外）
  if (!/"once"/.test(fxs)) {
    for (const m of text.matchAll(/【ターン1回】|【ゲーム1回】/g)) {
      const before = text.slice(Math.max(0, m.index - 10), m.index);
      if (/起動メイン/.test(before)) continue;
      warn(no, 'W2 once漏れ', clip(text, m.index, m[0].length)); break;
    }
  }

  // W3 リーダー対象漏れ（条件句「〜がいる場合」は対象でない＝除外。リーダー込みを内蔵する実装は合格:
  //   ・fxに leader/ownL 系トークン（"leader":true, incLeader, chooseOwnL, targetChoose:"ownL" 等）
  //   ・LEADER_NATIVE_OPS（donAttach/restDonForBuff＝プールが[リーダー,...キャラ]）
  //   ・negateChoose の filter/maxCost/charsOnly 無指定（既定プールがリーダー込み）
  //   ・onDonAttached フック（リーダー常駐フック＝リーダーかキャラへの付与で発火）
  //   ・counterBuff × バトル中文脈（アタック対象に適用＝公式は任意の自リーダー/キャラだが、バトルに効くのは防御側のみの意図的近似）
  //   ・powerCopy fromAttacker（アタック中のカード参照＝リーダー込み。OP04-069）
  const negateNoFilter = /"op":"negateChoose","[^{]*}/.test(fxs) || /"op":"negateChoose"}/.test(fxs);
  if (!/leader|ownl|fromattacker/i.test(fxs) && ![...opNames].some(n => LEADER_NATIVE_OPS.has(n)) && !negateNoFilter && !fx.onDonAttached) {
    for (const m of text.matchAll(/リーダー(か|または)[^。]{0,14}?キャラ|キャラ(か|または)[^。]{0,14}?リーダー/g)) {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
      if (/^が(いる|ある)場合/.test(after)) continue;
      if (/"counterBuff"/.test(fxs) && /バトル中/.test(text.slice(m.index, m.index + 40))) continue;
      warn(no, 'W3 リーダー対象漏れ', clip(text, m.index, m[0].length)); break;
    }
  }
}

// ── 出力 ──────────────────────────────────────────────
console.log(`fx ${Object.keys(CARD_FX).length}件 / op語彙 ${DOOP_OPS.size}(doOp)+${KNOWN_OPS.size - DOOP_OPS.size}(doOp外) / フック語彙 ${HOOKS.size}${sets.length ? ' / 対象セット: ' + sets.join(',') : ''}`);
if (errors.length) {
  console.log(`\n===== ERROR ${errors.length}件（確実に不発・誤動作） =====`);
  for (const e of errors) console.log(`  ${e.no} [${e.code}] ${e.where} — ${e.detail}`);
} else console.log('\nERROR: 0件');
if (warns.length) {
  const byCode = {};
  for (const w of warns) (byCode[w.code] = byCode[w.code] || []).push(w);
  console.log(`\n===== WARN ${warns.length}件（ヒューリスティック=要トリアージ） =====`);
  for (const code of Object.keys(byCode).sort()) {
    console.log(`-- ${code}: ${byCode[code].length}件`);
    for (const w of byCode[code]) console.log(`  ${w.no}  …${w.evidence}…`);
  }
} else console.log('WARN: 0件');
console.log(`\n集計: ERROR ${errors.length} / WARN ${warns.length}`);
if (jsonOut) {
  const report = {
    generatedAt: new Date().toISOString(), sets: sets.length ? sets : null,
    vocab: { doOpOps: DOOP_OPS.size, knownOps: KNOWN_OPS.size, hooks: [...HOOKS].sort() },
    summary: { errors: errors.length, warns: warns.length },
    errors, warns
  };
  fs.writeFileSync(path.join(ROOT, 'tools', 'lint-report.json'), JSON.stringify(report, null, 1));
  console.log('→ tools/lint-report.json 生成済');
}
process.exit(errors.length ? 1 : 0);

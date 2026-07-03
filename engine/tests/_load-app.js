/* tests/_load-app.js — テスト共通の読み込み／実行基盤。
   本体JSは src/00..60-*.js ＋ AI 層（ai-weights/ai-policy/ai-strategy/70-ai）。
   ★web/ 単一化に伴いバニラ index.html を廃止したため、旧「index.html の <script src> 順を
     読む」方式から、下記 SRC_FILES（＝旧 index.html と同順・../../scripts/sync-engine.mjs と一致）を
     唯一の真実源にした。順序を変えるときは sync-engine.mjs の FILES と揃えること。
   各テストハーネスは loadApp()/loadParts()/runHarness() を使う。 */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');

// 連結順（旧 index.html の <script src="src/..."> 順に一致。cards*.js は loadParts が別途前置）。
const SRC_FILES = [
  'src/00-data.js', 'src/10-engine-core.js', 'src/20-targeting-fx.js', 'src/30-flow-battle.js',
  'src/40-ui-render.js', 'src/50-input-cpu-ai.js', 'src/60-screens-init.js',
  'src/ai-weights.js', 'src/ai-policy.js', 'src/ai-strategy.js', 'src/70-ai.js',
];

// src/*.js を規定順で連結して返す（本体JS）。引数は後方互換のため受け取るが未使用。
function loadApp(_htmlPath) {
  const parts = SRC_FILES.map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  return parts.join('\n');
}

// ヘッドレス実行に必要な4部品（stubs + CARD_DB + CARD_FX + 本体JS）をまとめて読む。
function loadParts(htmlPath) {
  return {
    stubs: fs.readFileSync(path.join(__dirname, 'stubs.js'), 'utf8'),
    cards: fs.readFileSync(path.join(ROOT, 'cards.js'), 'utf8'),      // window.CARD_DB
    cardsfx: fs.readFileSync(path.join(ROOT, 'cards-fx.js'), 'utf8'), // window.CARD_FX
    cardsattr: fs.readFileSync(path.join(ROOT, 'cards-attr.js'), 'utf8'), // window.CARD_ATTR（属性）
    app: loadApp(htmlPath),                                           // src/00..60-*.js
  };
}

// stubs+cards+cards-fx+本体JS+harness を一時ファイルに連結して Node 実行し、標準出力を返す。
// harness はテスト本体のJS文字列（各ハーネスの String.raw`...`）。execOpts は execSync へ素通し（timeout 等）。
function runHarness(name, harness, execOpts = {}) {
  const { stubs, cards, cardsfx, cardsattr, app } = loadParts();
  const tmp = path.join(os.tmpdir(), `opcg-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(tmp, [stubs, cards, cardsfx, cardsattr, app, harness].join('\n'));
  try { return cp.execSync('node ' + JSON.stringify(tmp), { encoding: 'utf8', ...execOpts }); }
  finally { try { fs.unlinkSync(tmp); } catch (_) { /* noop */ } }
}

// runHarness の非同期版（Promiseを返す＝複数を Promise.all で並列実行できる）。規模拡大: 自己対戦の多コア並列化用。
// 各呼び出しは別プロセス＝状態汚染なし（CLAUDE.md のドレイン問題は同一プロセス内の話で、別プロセスなら無関係）。
function runHarnessAsync(name, harness, execOpts = {}) {
  const { stubs, cards, cardsfx, cardsattr, app } = loadParts();
  const tmp = path.join(os.tmpdir(), `opcg-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(tmp, [stubs, cards, cardsfx, cardsattr, app, harness].join('\n'));
  return new Promise((resolve, reject) => {
    cp.execFile('node', [tmp], { encoding: 'utf8', maxBuffer: 1 << 28, ...execOpts }, (err, stdout, stderr) => {
      try { fs.unlinkSync(tmp); } catch (_) { /* noop */ }
      if (err) { err.stdout = stdout; err.stderr = stderr; reject(err); }
      else resolve(stdout);
    });
  });
}

module.exports = { loadApp, loadParts, runHarness, runHarnessAsync, ROOT };

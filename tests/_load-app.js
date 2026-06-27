/* tests/_load-app.js — テスト共通の読み込み／実行基盤。
   分割後、本体JSは src/00..60-*.js の複数ファイル。index.html が記載する
   <script src="src/..."> の順を唯一の真実源として読み、その順で連結して返す。
   各テストハーネスは loadApp()/loadParts()/runHarness() を使う（個別の <script> 抽出正規表現・連結ボイラープレートは廃止）。 */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');

// index.html 記載順に src/*.js を連結して返す（本体JS）。
function loadApp(htmlPath) {
  const file = htmlPath || path.join(ROOT, process.env.OPCG_HTML || 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script\s+src=["'](src\/[^"']+)["']\s*>\s*<\/script>/g;
  const parts = []; let m;
  while ((m = re.exec(html))) parts.push(fs.readFileSync(path.join(ROOT, m[1]), 'utf8'));
  if (!parts.length) { console.error('✗ index.html に src/*.js の <script src> が見つかりません'); process.exit(1); }
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

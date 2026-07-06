#!/usr/bin/env node
/* tools/llm-warm-cache.js — hybrid(live Claude)の戦略キャッシュを“事前ウォーム”してfixtureに保存する。
   なぜ: live LLMは非決定的＝採否ゲートに使えない。先に各(リーダー|相手|ターン帯|ライフ)の戦略を引いてキャッシュに焼き、
        以後は measure-matchup が OPCG_LLM_CACHE で再生＝同一seedミラー＋符号検定で“決定的に”採否判定できる。

   前提: 別ターミナルで proxy を起動しておく（鍵が要る）:
         ANTHROPIC_API_KEY=sk-ant-... node tools/llm-proxy.js
   使い方:
         OPCG_HERO=enel OPCG_VILLAIN=teach OPCG_N=20 OPCG_OUT=fixtures/strategy-cache.json node tools/llm-warm-cache.js
   出力: OPCG_OUT(既定 fixtures/strategy-cache.json) に LLM_CACHE を追記マージして書き出す。
   ★proxyが未起動だと戦略はnullで埋まる（=puctフォールバック）。その場合は警告を出す。 */
const fs = require('fs'), path = require('path'), os = require('os');
const { runHarness } = require('./../tests/_load-app');
const CACHEP = path.join(os.tmpdir(), 'opcg-warm-cache-' + process.pid + '.json');   // ★stdout経由は巨大JSONがmaxBufferで切れる→ファイル受け渡し

const HERO = process.env.OPCG_HERO || 'enel';
const VILLAIN = process.env.OPCG_VILLAIN || 'teach';
const N = +(process.env.OPCG_N || 16);
const SEED0 = +(process.env.OPCG_SEED0 || 600000);
const OUT = process.env.OPCG_OUT || path.join(__dirname, '..', 'fixtures', 'strategy-cache.json');
const EXIST = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : 'null';

const harness = String.raw`
process.on('unhandledRejection', e => { console.error('UNHANDLED', e && e.stack || e); process.exit(1); });
// ★stubs.jsの拒否fetchをhttp直叩きのミニfetchに差し替える＝proxyへ実際に問い合わせる。
//   実fetch(undici)は使えない: stubsの setTimeout=setImmediate 差し替えでundici内部タイマーが壊れる
//   (fastNowTimeout.refresh is not a function)。さらにstubのsetTimeoutは遅延無視＝callClaudeの9s abortが
//   即発火するため、シムは opts.signal を無視する(ハング保護はharness全体の590sに委ねる)。localhost proxy専用。
const __http = require('http');
fetch = function (url, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const req = __http.request({ hostname: u.hostname, port: u.port || 80, path: u.pathname + (u.search || ''), method: opts.method || 'GET', headers: opts.headers || {} }, function (res) {
      let b = ''; res.setEncoding('utf8'); res.on('data', function (c) { b += c; });
      res.on('end', function () { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: function () { return Promise.resolve(JSON.parse(b)); }, text: function () { return Promise.resolve(b); } }); });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
};
G.aiOn = false;
showPrompt = function (cfg) { const t = cfg.title || ''; let v;
  if (t.indexOf('マリガン') >= 0) v = cpuShouldMulligan(G.players.me);
  else { const o = cfg.opts || []; const x = o.find(z => z.primary) || o[0]; v = x ? x.v : undefined; }
  if (cfg.onPick) cfg.onPick(v); return Promise.resolve(v); };
humanPick = function (c) { return Promise.resolve(c[0] || null); };
loadLLMCache(` + EXIST + `);   // 既存fixtureを土台に追記マージ
const HERO = ` + JSON.stringify(HERO) + `, VILLAIN = ` + JSON.stringify(VILLAIN) + `, S0 = ` + SEED0 + `, N = ` + N + `;
(async () => {
  const up = await llmHealth();
  if (!up) console.error('⚠ proxyに接続できません（戦略はnullで埋まります）。 ANTHROPIC_API_KEY=... node tools/llm-proxy.js を起動してください。');
  for (let i = 0; i < N; i++) {
    G.players = {}; G.winner = null; G.inGame = false; seedRng(S0 + i); startGame(HERO, VILLAIN);
    G.players.me.isCPU = true; G.players.me.agent = 'hybrid'; G.players.cpu.isCPU = true; G.players.cpu.agent = 'heuristic';
    G._puctDet = 3;
    let it = 0; while (!(G.winner && !G._sim) && it < 5000000) { await new Promise(r => setImmediate(r)); it++; }
    for (let k = 0; k < 40; k++) await new Promise(r => setImmediate(r));
  }
  const keys = Object.keys(LLM_CACHE), filled = keys.filter(k => LLM_CACHE[k]).length;
  console.error('  ウォーム完了: キー' + keys.length + '件 / うち戦略あり' + filled + '件');
  require('fs').writeFileSync(` + JSON.stringify(CACHEP) + `, JSON.stringify(LLM_CACHE));
  console.log('CACHE_WRITTEN');
  process.exit(0);
})();
`;

const out = runHarness('warm', harness, { timeout: 590000 });
if (!/CACHE_WRITTEN/.test(out)) { console.error('✗ キャッシュ取得失敗\n' + out.slice(-800)); process.exit(1); }
const merged = JSON.parse(fs.readFileSync(CACHEP, 'utf8'));
try { fs.unlinkSync(CACHEP); } catch (_) { /* noop */ }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(merged, null, 0));
console.error('✓ 書き出し: ' + OUT + '  (' + Object.keys(merged).length + 'キー)');

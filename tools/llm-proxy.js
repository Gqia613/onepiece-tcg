#!/usr/bin/env node
/* tools/llm-proxy.js — ブラウザ(file://)から Anthropic API を叩くための極小ローカル中継。
   なぜ必要か: ①ブラウザから api.anthropic.com を直接叩くと CORS で遮断される（file:// は特に）。
              ②APIキーをブラウザ/リポジトリに置けない（漏洩・CLAUDE.mdのlocalStorage禁止）。
   このproxyが鍵を「このNodeプロセスのenvだけ」に保持し、CORSを解放して中継する。

   - POST /v1/messages → api.anthropic.com にそのまま中継（x-api-key と anthropic-version を付与）。
   - GET  /healthz     → {ok:true} 起動確認（クライアントは事前にこれで生存確認できる）。
   - すべての応答に CORS ヘッダ（Access-Control-Allow-Origin:*）。OPTIONS プリフライト対応。

   使い方:  ANTHROPIC_API_KEY=sk-ant-... node tools/llm-proxy.js  [PORT(既定8787)]
   依存:    Node標準ライブラリのみ（http/https）。鍵はenvのみ＝リポジトリに出さない。 */
'use strict';
const http = require('http');
const https = require('https');

const PORT = +(process.argv[2] || process.env.OPCG_LLM_PORT || 8787);
const KEY = process.env.ANTHROPIC_API_KEY || '';
const VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';
const UPSTREAM = 'api.anthropic.com';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-api-key, anthropic-version, anthropic-beta');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
}
function sendJSON(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/healthz') { sendJSON(res, 200, { ok: true, hasKey: !!KEY }); return; }
  if (req.method === 'POST' && req.url.indexOf('/v1/') === 0) {
    if (!KEY) { sendJSON(res, 500, { error: 'ANTHROPIC_API_KEY 未設定（proxy起動時のenvに設定してください）' }); return; }
    let body = '';
    req.on('data', d => { body += d; if (body.length > 4e6) req.destroy(); });
    req.on('end', () => {
      const up = https.request({
        host: UPSTREAM, port: 443, path: req.url, method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': KEY,
          'anthropic-version': VERSION,
          'content-length': Buffer.byteLength(body)
        }
      }, ur => { res.writeHead(ur.statusCode || 502, { 'Content-Type': 'application/json' }); ur.pipe(res); });
      up.on('error', e => sendJSON(res, 502, { error: 'upstream ' + e.message }));
      up.end(body);
    });
    return;
  }
  sendJSON(res, 404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('OPCG LLM proxy → http://127.0.0.1:' + PORT + '  (APIキー ' + (KEY ? 'OK' : '★未設定★') + ')');
  if (!KEY) console.log('  ※ ANTHROPIC_API_KEY が未設定です。 ANTHROPIC_API_KEY=sk-ant-... node tools/llm-proxy.js で起動してください。');
});

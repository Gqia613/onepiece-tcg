// AI proxy: ブラウザ→(認証/上限/キャッシュ)→Anthropic 中継。鍵はサーバ secret のみ（クライアントに出さない）。
// tools/llm-proxy.js の中継ロジックを Cloudflare Functions へ移植＋認証ゲート＋per-user/day上限＋任意KVキャッシュ。
import { json } from '../_lib/respond.js';

const DAILY_LIMIT = 1000;                      // 1ユーザー/日の上限（コスト保護）。カウンター/トリガー助言も呼ぶため1ゲームで数十回消費する→友達規模向けに緩め
const UPSTREAM = 'https://api.anthropic.com/v1/messages';
const ALLOWED_MODELS = new Set(['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']);

// GET /api/ai — 生存確認（llmHealth 用）。認証必須。
export const onRequestGet = async ({ env, data }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  return json({ ok: true, hasKey: !!env.ANTHROPIC_API_KEY });
};

// POST /api/ai — Anthropic /v1/messages 中継（body は Anthropic 形式）。
export const onRequestPost = async ({ request, env, data }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'no_api_key' }, 500);
  if (!env.DB) return json({ error: 'no_db' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const safe = sanitize(body);
  if (!safe) return json({ error: 'invalid' }, 400);

  // per-user/day 上限（D1。KV書込上限回避のためカウンタはD1）
  const day = new Date().toISOString().slice(0, 10);
  const usage = await env.DB.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND day = ?').bind(data.user.id, day).first();
  if (usage && usage.count >= DAILY_LIMIT) return json({ error: 'rate', limit: DAILY_LIMIT }, 429);

  // 任意KVキャッシュ（env.AICACHE があれば。同一リクエストの再呼び出しで Anthropic を叩かない）
  const reqStr = JSON.stringify(safe);
  let cacheKey = null;
  if (env.AICACHE) {
    try {
      cacheKey = 'ai:' + (await sha256hex(reqStr));
      const cached = await env.AICACHE.get(cacheKey);
      if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
    } catch { /* キャッシュ不調は無視して通常中継 */ }
  }

  // Anthropic へ中継
  let up;
  try {
    up = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': env.ANTHROPIC_VERSION || '2023-06-01',
      },
      body: reqStr,
    });
  } catch (e) {
    return json({ error: 'upstream', detail: String(e && e.message || e) }, 502);
  }

  const text = await up.text();
  if (up.ok) {
    // 成功時のみ課金カウント＋キャッシュ
    await env.DB
      .prepare('INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1')
      .bind(data.user.id, day).run();
    if (env.AICACHE && cacheKey) { try { await env.AICACHE.put(cacheKey, text, { expirationTtl: 60 * 60 * 24 }); } catch { /* ignore */ } }
  }
  return new Response(text, { status: up.status, headers: { 'Content-Type': 'application/json', 'X-Cache': env.AICACHE ? 'MISS' : 'OFF' } });
};

// 入力の最小サニタイズ＋クランプ（暴走/高額化防止）
export function sanitize(b) {
  if (!b || typeof b !== 'object') return null;
  if (!Array.isArray(b.messages) || b.messages.length === 0) return null;
  const model = (typeof b.model === 'string' && ALLOWED_MODELS.has(b.model)) ? b.model : 'claude-sonnet-4-6';
  let mt = parseInt(b.max_tokens, 10); if (!Number.isFinite(mt)) mt = 1024;
  const max_tokens = Math.min(Math.max(mt, 1), 4096);
  const out = { model, max_tokens, messages: b.messages };
  if (typeof b.system === 'string') out.system = b.system;
  if (Array.isArray(b.tools)) out.tools = b.tools;
  if (b.tool_choice) out.tool_choice = b.tool_choice;
  return out;
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

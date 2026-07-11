// opcg-realtime Worker 入口。
// - POST /rooms            : 部屋を作成（短命JWT必須）→ {code}
// - GET  /rooms/:code/ws   : WebSocket アップグレード → MatchRoom DO へ転送
// トークンは Pages の /api/match/token が発行（JWT_SECRET を両者で共有）。
// WS のトークンは URL に載せず Sec-WebSocket-Protocol の第2要素で渡す（ログ残留防止）。
import { verifyJWT, type MatchTokenPayload } from './jwt';
export { MatchRoom } from './room';

export interface Env {
  MATCH_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  ALLOW_NO_ORIGIN?: string; // 'true' でOriginヘッダ無しを許可（ローカルのNodeテスト用。 本番では設定しない）
}

// 紛らわしい文字（0/O/1/I/L）を除いた部屋コード用アルファベット
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LEN = 6;

function genCode(): string {
  const buf = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[buf[i] % CODE_CHARS.length];
  return s;
}

function originAllowed(origin: string | null, env: Env): boolean {
  if (!origin) return env.ALLOW_NO_ORIGIN === 'true';
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return true;
  // Pages のプレビューデプロイ（https://<hash>.opcg-sim.pages.dev）も許可
  return /^https:\/\/[a-z0-9-]+\.opcg-sim\.pages\.dev$/.test(origin);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(obj: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

async function bearerAuth(req: Request, env: Env): Promise<MatchTokenPayload | null> {
  const h = req.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) return null;
  const p = await verifyJWT(m[1], env.JWT_SECRET);
  if (!p || p.scope !== 'match') return null;
  return p;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');

    // 部屋作成（ブラウザからの fetch＝CORS 必要）
    if (url.pathname === '/rooms') {
      if (req.method === 'OPTIONS') {
        if (!originAllowed(origin, env)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: corsHeaders(origin!) });
      }
      if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!originAllowed(origin, env)) return json({ error: 'forbidden_origin' }, 403);
      const cors = corsHeaders(origin!);
      const user = await bearerAuth(req, env);
      if (!user) return json({ error: 'bad_token' }, 401, cors);
      // 未使用コードを引くまで最大5回リトライ（31^6 ≈ 8.9億空間なので実質1回で当たる）
      for (let i = 0; i < 5; i++) {
        const code = genCode();
        const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName(code));
        const r = await stub.fetch('https://do/init', {
          method: 'POST',
          body: JSON.stringify({ code, hostUid: user.uid, hostName: user.un }),
        });
        if (r.status === 200) return json({ code }, 200, cors);
        if (r.status !== 409) return json({ error: 'init_failed' }, 500, cors);
      }
      return json({ error: 'code_exhausted' }, 500, cors);
    }

    // WebSocket アップグレード
    const m = /^\/rooms\/([A-Z0-9]{4,8})\/ws$/.exec(url.pathname);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected_websocket' }, 426);
      if (!originAllowed(origin, env)) return json({ error: 'forbidden_origin' }, 403);
      // Sec-WebSocket-Protocol: "opcg, <token>"
      const proto = req.headers.get('Sec-WebSocket-Protocol') || '';
      const parts = proto.split(',').map((s) => s.trim());
      const token = parts.length >= 2 && parts[0] === 'opcg' ? parts[1] : null;
      const user = token ? await verifyJWT(token, env.JWT_SECRET) : null;
      if (!user || user.scope !== 'match') return json({ error: 'bad_token' }, 401);
      const code = m[1];
      const stub = env.MATCH_ROOM.get(env.MATCH_ROOM.idFromName(code));
      // 検証済みユーザーをヘッダで DO へ引き渡す（DO では再検証しない）
      const fwd = new Request(req.url, req);
      fwd.headers.set('X-Auth-Uid', String(user.uid));
      fwd.headers.set('X-Auth-Name', String(user.un || ''));
      return stub.fetch(fwd);
    }

    if (url.pathname === '/healthz') return json({ ok: true });
    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;

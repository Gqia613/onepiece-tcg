// Cookie の読み書きヘルパ。
export const SESSION_COOKIE = 'session';
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30日

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) {
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

// http://localhost も「セキュアコンテキスト」扱いなので Secure 付きで本番/ローカル両対応。
export function sessionCookie(token, maxAge = SESSION_TTL) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

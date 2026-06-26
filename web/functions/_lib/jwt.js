// セッションJWT(HS256)。外部ライブラリ不要・Web Cryptoのみ。
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64url(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strToB64url(str) {
  return bytesToB64url(enc.encode(str));
}
function b64urlToBytes(b64) {
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signJWT(payload, secret, ttlSec = 60 * 60 * 24 * 30) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const data = strToB64url(JSON.stringify(header)) + '.' + strToB64url(JSON.stringify(body));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return data + '.' + bytesToB64url(sig);
}

export async function verifyJWT(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = parts[0] + '.' + parts[1];
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlToBytes(parts[2]), enc.encode(data));
  } catch { return null; }
  if (!ok) return null;
  let body;
  try { body = JSON.parse(dec.decode(b64urlToBytes(parts[1]))); } catch { return null; }
  if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null;
  return body;
}

// パスワードハッシュ (PBKDF2-SHA256 + ランダムsalt)。Web Cryptoのみ。
const enc = new TextEncoder();
const ITERATIONS = 100000;
const KEYLEN_BITS = 256;

function bytesToB64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password, salt) {
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMat,
    KEYLEN_BITS,
  );
}

// 新規登録用: {hash, salt} (どちらもbase64) を返す。
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt);
  return { hash: bytesToB64(bits), salt: bytesToB64(salt) };
}

// 照合用: 定数時間比較。
export async function verifyPassword(password, hashB64, saltB64) {
  let salt;
  try { salt = b64ToBytes(saltB64); } catch { return false; }
  const bits = await derive(password, salt);
  const got = bytesToB64(bits);
  if (got.length !== hashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hashB64.charCodeAt(i);
  return diff === 0;
}

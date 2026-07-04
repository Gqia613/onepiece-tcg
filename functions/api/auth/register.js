import { json } from '../../_lib/respond.js';
import { hashPassword } from '../../_lib/password.js';
import { signJWT } from '../../_lib/jwt.js';
import { sessionCookie, SESSION_TTL } from '../../_lib/cookies.js';

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return json({ error: 'no_db' }, 500);
  if (!env.JWT_SECRET) return json({ error: 'no_secret' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }

  // 招待コードゲート（友達限定）。INVITE_CODE(Pages Secret) が未設定なら登録は閉鎖（フェイルセーフ）。
  // 招待を先に検証＝正しいコードが無いとユーザー名の存在確認等の処理にも進めない。
  if (!env.INVITE_CODE) return json({ error: 'registration_closed' }, 403);
  const invite = String(body.invite || '').trim();
  if (invite !== env.INVITE_CODE) return json({ error: 'bad_invite' }, 403);

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!USERNAME_RE.test(username) || password.length < 6 || password.length > 200) {
    return json({ error: 'invalid' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) return json({ error: 'taken' }, 409);

  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();
  await env.DB
    .prepare('INSERT INTO users (id, username, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, username, hash, salt, Date.now())
    .run();

  const token = await signJWT({ uid: id, un: username }, env.JWT_SECRET, SESSION_TTL);
  return json({ user: { id, username } }, 200, { 'Set-Cookie': sessionCookie(token) });
};

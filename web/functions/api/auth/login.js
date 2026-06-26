import { json } from '../../_lib/respond.js';
import { verifyPassword } from '../../_lib/password.js';
import { signJWT } from '../../_lib/jwt.js';
import { sessionCookie, SESSION_TTL } from '../../_lib/cookies.js';

const MAX_ATTEMPTS_PER_HOUR = 10;

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return json({ error: 'no_db' }, 500);
  if (!env.JWT_SECRET) return json({ error: 'no_secret' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return json({ error: 'invalid' }, 400);

  // 簡易レート制限（username単位・1時間窓）。
  const win = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const att = await env.DB
    .prepare('SELECT count FROM login_attempts WHERE username = ? AND win = ?')
    .bind(username, win).first();
  if (att && att.count >= MAX_ATTEMPTS_PER_HOUR) return json({ error: 'rate' }, 429);

  const u = await env.DB
    .prepare('SELECT id, username, pass_hash, pass_salt FROM users WHERE username = ?')
    .bind(username).first();
  const ok = u ? await verifyPassword(password, u.pass_hash, u.pass_salt) : false;

  if (!ok) {
    await env.DB
      .prepare('INSERT INTO login_attempts (username, win, count) VALUES (?, ?, 1) ON CONFLICT(username, win) DO UPDATE SET count = count + 1')
      .bind(username, win).run();
    return json({ error: 'unauthorized' }, 401);
  }

  const token = await signJWT({ uid: u.id, un: u.username }, env.JWT_SECRET, SESSION_TTL);
  return json({ user: { id: u.id, username: u.username } }, 200, { 'Set-Cookie': sessionCookie(token) });
};

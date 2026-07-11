// オンライン対戦用の短命トークン発行。
// realtime Worker（opcg-realtime）は別オリジンのため HttpOnly セッション cookie が届かない。
// そこで cookie 認証済みのユーザーへ 60 秒の JWT（scope:'match'）を発行し、
// WS 接続時に Sec-WebSocket-Protocol で渡す。
// 署名鍵は MATCH_JWT_SECRET（Pages と realtime Worker の両方に同一値を設定。セッション用
// JWT_SECRET とは独立＝ローテーションしてもログインセッションに影響しない）。
// 未設定環境（ローカル等）は JWT_SECRET にフォールバック。
// 環境変数 REALTIME_URL に realtime Worker のベースURL（例 https://opcg-realtime.xxx.workers.dev）を設定。
import { json } from '../../_lib/respond.js';
import { signJWT } from '../../_lib/jwt.js';

export async function onRequestGet({ data, env }) {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.REALTIME_URL) return json({ error: 'realtime_unconfigured' }, 503);
  const secret = env.MATCH_JWT_SECRET || env.JWT_SECRET;
  const token = await signJWT({ uid: data.user.id, un: data.user.username, scope: 'match' }, secret, 60);
  return json({ token, url: String(env.REALTIME_URL).replace(/\/+$/, '') });
}

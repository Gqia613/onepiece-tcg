// /api/* 共通: セッションcookieを検証し context.data.user を埋める（best-effort）。
// 実際の認証強制は各保護エンドポイント側で data.user を見て行う（me/auth は未認証でも到達可）。
import { parseCookies, SESSION_COOKIE } from '../_lib/cookies.js';
import { verifyJWT } from '../_lib/jwt.js';

export async function onRequest(context) {
  const { request, env, data, next } = context;
  data.user = null;
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token && env.JWT_SECRET) {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (payload && payload.uid) data.user = { id: payload.uid, username: payload.un };
  }
  return next();
}

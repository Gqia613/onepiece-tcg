import { json } from '../_lib/respond.js';
import { clearSessionCookie } from '../_lib/cookies.js';

export const onRequestPost = async () => json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });

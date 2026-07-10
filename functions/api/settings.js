// アカウントごとの設定（効果音/BGMのON/OFF・音量・曲）。
// GET  /api/settings — ログインユーザーの設定（未保存なら既定値）
// PUT  /api/settings — 設定を保存（全フィールド送信・サーバで検証して上書き）
import { json } from '../_lib/respond.js';

const TRACKS = new Set(['random', 'adventure', 'battle', 'casual', 'wafu']);
const DEFAULTS = { muted: false, bgmOn: true, bgmVolume: 0.4, bgmTrack: 'adventure' };

export const onRequestGet = async ({ env, data }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ settings: DEFAULTS });
  const row = await env.DB.prepare('SELECT data FROM user_settings WHERE user_id = ?').bind(data.user.id).first();
  return json({ settings: sanitize({ ...DEFAULTS, ...safeParse(row && row.data) }) });
};

export const onRequestPut = async ({ request, env, data }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'no_db' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  // 部分更新も許すため既定値とマージしてから検証（フロントは常に全フィールド送る想定）。
  const next = sanitize({ ...DEFAULTS, ...(body && typeof body === 'object' ? body : {}) });
  await env.DB.prepare(
    'INSERT INTO user_settings (user_id, data, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
  ).bind(data.user.id, JSON.stringify(next), Date.now()).run();
  return json({ settings: next });
};

function sanitize(s) {
  const v = Number(s && s.bgmVolume);
  return {
    muted: !!(s && s.muted),
    bgmOn: !!(s && s.bgmOn),
    bgmVolume: Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULTS.bgmVolume,
    bgmTrack: s && TRACKS.has(s.bgmTrack) ? s.bgmTrack : DEFAULTS.bgmTrack,
  };
}
function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

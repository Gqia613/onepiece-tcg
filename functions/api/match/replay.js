// リプレイ取得。replay は {seed, decks, names, first, config, inputs} のJSON文字列。
// 私的グループ用＝ログインユーザーなら誰の対戦でも再生できる（戦績画面からの観戦/研究用途）。
// viewerSeat は参加者なら自分の席、第三者観戦なら host 視点。
import { json } from '../../_lib/respond.js';

export async function onRequestGet({ request, data, env }) {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'no_db' }, 503);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'bad_id' }, 400);
  try {
    const row = await env.DB.prepare(
      `SELECT id, host_uid, guest_uid, host_name, guest_name, winner, reason, turns, created_at, replay
       FROM matches WHERE id = ?1`,
    ).bind(id).first();
    if (!row || !row.replay) return json({ error: 'not_found' }, 404);
    return json({
      id: row.id,
      viewerSeat: row.guest_uid === data.user.id ? 'guest' : 'host',
      winner: row.winner, reason: row.reason, turns: row.turns, created_at: row.created_at,
      replay: JSON.parse(row.replay),
    });
  } catch {
    return json({ error: 'not_found' }, 404);
  }
}

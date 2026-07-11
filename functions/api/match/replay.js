// リプレイ取得（参加者本人のみ）。replay は {seed, decks, names, first, config, inputs} のJSON文字列。
import { json } from '../../_lib/respond.js';

export async function onRequestGet({ request, data, env }) {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'no_db' }, 503);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'bad_id' }, 400);
  try {
    const row = await env.DB.prepare(
      `SELECT id, host_uid, guest_uid, host_name, guest_name, winner, reason, turns, created_at, replay
       FROM matches WHERE id = ?1 AND (host_uid = ?2 OR guest_uid = ?2)`,
    ).bind(id, data.user.id).first();
    if (!row || !row.replay) return json({ error: 'not_found' }, 404);
    return json({
      id: row.id,
      viewerSeat: row.host_uid === data.user.id ? 'host' : 'guest',
      winner: row.winner, reason: row.reason, turns: row.turns, created_at: row.created_at,
      replay: JSON.parse(row.replay),
    });
  } catch {
    return json({ error: 'not_found' }, 404);
  }
}

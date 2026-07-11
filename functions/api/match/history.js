// オンライン対戦の戦績一覧（自分が参加した対戦）。
// 書き込みは realtime Worker の MatchRoom（両者の終局申告が一致した場合のみ）。ここは読むだけ。
import { json } from '../../_lib/respond.js';

export async function onRequestGet({ data, env }) {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ matches: [] });
  try {
    const rs = await env.DB.prepare(
      `SELECT id, code, game_no, host_uid, guest_uid, host_name, guest_name,
              host_leader, guest_leader, winner, reason, turns, created_at
       FROM matches WHERE host_uid = ?1 OR guest_uid = ?1
       ORDER BY id DESC LIMIT 30`,
    ).bind(data.user.id).all();
    return json({ matches: rs.results || [] });
  } catch {
    return json({ matches: [] }); // テーブル未作成（対戦記録なし）等は空で返す
  }
}

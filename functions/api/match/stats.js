// グループ全体のオンライン対戦結果（リプレイ本体抜きの軽量列）。
// 私的グループ用＝ログインユーザーなら全員の対戦を閲覧できる（戦績ダッシュボードの元データ）。
import { json } from '../../_lib/respond.js';

// GET /api/match/stats
export async function onRequestGet({ data, env }) {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ matches: [] });
  try {
    const rs = await env.DB.prepare(
      `SELECT id, host_uid, guest_uid, host_name, guest_name,
              host_leader, guest_leader, winner, reason, turns, created_at,
              (replay IS NOT NULL) AS has_replay
       FROM matches ORDER BY id DESC LIMIT 1000`,
    ).all();
    return json({ matches: rs.results || [] });
  } catch {
    return json({ matches: [] }); // テーブル未作成（対戦記録なし）等は空で返す
  }
}

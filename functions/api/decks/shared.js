// みんなの共有デッキ一覧（自分以外のユーザーが共有中のデッキ）。
// 私的グループ用＝共有ONのデッキは全ログインユーザーに見える。
import { json } from '../../_lib/respond.js';

// GET /api/decks/shared
export const onRequestGet = async ({ env, data }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ decks: [] });
  try {
    const { results } = await env.DB.prepare(
      `SELECT d.id, d.name, d.leader, d.list, d.updated_at, u.username AS owner
       FROM deck_shares s
       JOIN decks d ON d.id = s.deck_id
       JOIN users u ON u.id = d.user_id
       WHERE d.user_id != ?
       ORDER BY d.updated_at DESC`,
    ).bind(data.user.id).all();
    const decks = (results || []).map((r) => ({
      id: r.id, name: r.name, leader: r.leader,
      list: safeParse(r.list), updatedAt: r.updated_at, owner: r.owner,
    }));
    return json({ decks });
  } catch {
    return json({ decks: [] }); // テーブル未作成（共有なし）等は空で返す
  }
};

function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

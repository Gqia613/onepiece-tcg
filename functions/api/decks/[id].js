// 個別デッキの更新 / 削除。すべて user_id を強制（他人のデッキは操作不可）。
import { json } from '../../_lib/respond.js';
import { validateDeck } from '../decks.js';

// PUT /api/decks/:id — 上書き保存
export const onRequestPut = async ({ request, env, data, params }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'no_db' }, 500);
  const id = params.id;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const v = validateDeck(body);
  if (!v.ok) return json({ error: 'invalid', detail: v.error }, 400);

  const now = Date.now();
  const res = await env.DB
    .prepare('UPDATE decks SET name = ?, leader = ?, list = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(v.name, v.leader, JSON.stringify(v.list), now, id, data.user.id)
    .run();
  // 所有者でない/存在しない場合は更新0件
  if (!res.meta || res.meta.changes === 0) return json({ error: 'not_found' }, 404);
  return json({ deck: { id, name: v.name, leader: v.leader, list: v.list, updatedAt: now } });
};

// DELETE /api/decks/:id
export const onRequestDelete = async ({ env, data, params }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'no_db' }, 500);
  const res = await env.DB
    .prepare('DELETE FROM decks WHERE id = ? AND user_id = ?')
    .bind(params.id, data.user.id)
    .run();
  if (!res.meta || res.meta.changes === 0) return json({ error: 'not_found' }, 404);
  return json({ ok: true });
};

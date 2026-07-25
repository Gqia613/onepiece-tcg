// デッキの共有ON/OFF（所有者のみ）。ONで deck_shares に行を作る＝グループ全員に公開。
import { json } from '../../../_lib/respond.js';

// PUT /api/decks/:id/share — body: {shared: boolean}
export const onRequestPut = async ({ request, env, data, params }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'no_db' }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const on = !!(body && body.shared);

  const own = await env.DB.prepare('SELECT id FROM decks WHERE id = ? AND user_id = ?')
    .bind(params.id, data.user.id).first();
  if (!own) return json({ error: 'not_found' }, 404);

  if (on) {
    await env.DB.prepare('INSERT OR REPLACE INTO deck_shares (deck_id, shared_at) VALUES (?, ?)')
      .bind(params.id, Date.now()).run();
  } else {
    await env.DB.prepare('DELETE FROM deck_shares WHERE deck_id = ?').bind(params.id).run();
  }
  return json({ ok: true, shared: on });
};

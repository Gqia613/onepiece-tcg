// デッキのクラウド保存（一覧 / 作成）。すべて user_id を強制（他人のデッキは見えない/作れない）。
import { json } from '../_lib/respond.js';

const MAX_DECKS = 100;

// GET /api/decks — ログインユーザーのデッキ一覧
export const onRequestGet = async ({ env, data }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'no_db' }, 500);
  const { results } = await env.DB
    .prepare('SELECT id, name, leader, list, updated_at FROM decks WHERE user_id = ? ORDER BY updated_at DESC')
    .bind(data.user.id).all();
  const decks = (results || []).map((r) => ({
    id: r.id, name: r.name, leader: r.leader,
    list: safeParse(r.list), updatedAt: r.updated_at,
  }));
  return json({ decks });
};

// POST /api/decks — デッキを作成（インポート保存）。body: {name, leader, list:{no:count}}
export const onRequestPost = async ({ request, env, data }) => {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'no_db' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const v = validateDeck(body);
  if (!v.ok) return json({ error: 'invalid', detail: v.error }, 400);

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM decks WHERE user_id = ?').bind(data.user.id).first();
  if (countRow && countRow.n >= MAX_DECKS) return json({ error: 'too_many' }, 409);

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB
    .prepare('INSERT INTO decks (id, user_id, name, leader, list, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, data.user.id, v.name, v.leader, JSON.stringify(v.list), now)
    .run();
  return json({ deck: { id, name: v.name, leader: v.leader, list: v.list, updatedAt: now } });
};

function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

// サーバ側の最小検証（カード実在性はクライアント=エンジンが検証。ここは形と上限のみ）。
export function validateDeck(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'shape' };
  const name = String(body.name || 'マイデッキ').trim().slice(0, 60) || 'マイデッキ';
  const leader = String(body.leader || '');
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(leader)) return { ok: false, error: 'leader' };
  const list = body.list;
  if (!list || typeof list !== 'object' || Array.isArray(list)) return { ok: false, error: 'list' };
  const keys = Object.keys(list);
  if (keys.length === 0 || keys.length > 80) return { ok: false, error: 'list_size' };
  let total = 0;
  const clean = {};
  for (const k of keys) {
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(k)) return { ok: false, error: 'card_no' };
    const n = list[k] | 0;
    if (n < 1 || n > 50) return { ok: false, error: 'count' };
    clean[k] = n; total += n;
  }
  if (total !== 50) return { ok: false, error: 'total_' + total }; // 公式: デッキは50枚
  return { ok: true, name, leader, list: clean };
}

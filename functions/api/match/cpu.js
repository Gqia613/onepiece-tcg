// CPU戦（オフライン対戦）のリプレイ内部収集（学習・解析用。UI表示なし）。
// クライアント（src/net/cpuRecorder.ts）が終局時に POST する。書き込みのみ・読み出しAPIは未提供
// （解析は wrangler d1 execute で直接引く。必要になったら replay.js と同型の GET を足す）。
import { json } from '../../_lib/respond.js';

const MAX_BODY = 950000; // D1 行サイズ安全域（replay 900KB + メタ）

export async function onRequestPost({ request, data, env }) {
  if (!data.user) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'no_db' }, 503);
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const seed = Number(body.seed) >>> 0;
  const winner = String(body.winner || '');
  if (!seed || !['host', 'guest', 'draw'].includes(winner) || typeof body.replay !== 'object' || !body.replay) {
    return json({ error: 'bad_body' }, 400);
  }
  try {
    // ★uid は UUID 文字列（users.id）。数値変換しない（matches の前科と同じ罠）
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS cpu_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT,
        leader TEXT, cpu_leader TEXT, winner TEXT NOT NULL, reason TEXT, turns INTEGER,
        seed INTEGER NOT NULL, ver TEXT, replay TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    ).run();
    const out = await env.DB.prepare(
      `INSERT INTO cpu_matches (uid, name, leader, cpu_leader, winner, reason, turns, seed, ver, replay)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      data.user.id, data.user.username || '',
      String(body.leader || ''), String(body.cpu_leader || ''),
      winner, String(body.reason || '') || null, Number(body.turns) || null,
      seed, String(body.ver || '') || null, JSON.stringify(body.replay),
    ).run();
    const id = out.meta && typeof out.meta.last_row_id === 'number' ? out.meta.last_row_id : null;
    return json({ id });
  } catch (e) {
    return json({ error: 'db_failed' }, 500);
  }
}

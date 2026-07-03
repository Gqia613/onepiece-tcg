-- D1 スキーマ（SQLite）。`wrangler d1 execute opcg --local --file=./schema.sql` で投入。

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,           -- ランダムID
  username   TEXT UNIQUE NOT NULL,       -- ログインID（一意）
  pass_hash  TEXT NOT NULL,              -- PBKDF2-SHA256 ハッシュ(base64)
  pass_salt  TEXT NOT NULL,              -- ソルト(base64)
  created_at INTEGER NOT NULL            -- epoch ms
);

CREATE TABLE IF NOT EXISTS decks (
  id         TEXT PRIMARY KEY,           -- サーバ発行ID
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  leader     TEXT NOT NULL,              -- リーダーのカード番号
  list       TEXT NOT NULL,              -- JSON文字列 {no: count}
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);

-- AI 1日あたり利用回数（KV書込上限回避のため D1 でカウント）
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  day     TEXT NOT NULL,                 -- 'YYYY-MM-DD'(UTC)
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- ログイン試行のレート制限（簡易）。`window` はSQLite予約語なので `win` を使う。
CREATE TABLE IF NOT EXISTS login_attempts (
  username TEXT NOT NULL,
  win      TEXT NOT NULL,                -- 'YYYY-MM-DDTHH'(UTC)
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (username, win)
);

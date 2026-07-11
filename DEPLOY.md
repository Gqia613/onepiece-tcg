# DEPLOY.md — Cloudflare Pages 本番デプロイ手順

web アプリ（このリポジトリのルート）を Cloudflare Pages + Functions + D1 で公開する手順。
すべて**リポジトリのルート**で実行。`npx wrangler`（v3.114+ 動作確認済み）を使う。

## 必要なもの
- Cloudflare アカウント（無料枠でOK）
- **ログイン＋デッキ保存に必須**: D1 データベース（binding `DB`）＋ `JWT_SECRET`
- **新規登録の招待ゲート**: `INVITE_CODE`（★未設定だと登録は閉鎖＝既存ユーザーのログインは可能）
- **AI対戦を使う場合のみ**: `ANTHROPIC_API_KEY`（＋任意で KV `AICACHE`・`ANTHROPIC_VERSION`）

functions が参照する env: `DB`(D1) / `JWT_SECRET` / `INVITE_CODE` / `ANTHROPIC_API_KEY` / `ANTHROPIC_VERSION` / `AICACHE`(KV) / **オンライン対戦用** `REALTIME_URL`・`MATCH_JWT_SECRET`（§D）。

---

## A. wrangler CLI で公開（最短・再現性高）

```bash
# 1) Cloudflare にログイン
npx wrangler login

# 2) D1 を作成 → 出力の database_id を wrangler.toml に貼る
npx wrangler d1 create opcg
#   → 出力の `database_id = "xxxxxxxx-..."` を wrangler.toml の
#     REPLACE_WITH_D1_DATABASE_ID と差し替える（database_id は秘密ではない＝コミットOK）

# 3) 本番 D1 にテーブル作成（users/decks/ai_usage/login_attempts）
npm run d1:remote

# 4) ビルド
npm run build

# 5) Pages プロジェクト作成（初回のみ）
npx wrangler pages project create opcg-sim --production-branch main

# 6) シークレット設定（★ログインに必須の JWT_SECRET）
#    値を生成してコピー:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#    設定（プロンプトに上の値を貼る）:
npx wrangler pages secret put JWT_SECRET --project-name opcg-sim
#    ★招待コード（新規登録ゲート。未設定だと登録は閉鎖＝既存ユーザーのログインは可）:
npx wrangler pages secret put INVITE_CODE --project-name opcg-sim
#    （AI対戦も使うなら）Anthropic APIキー:
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name opcg-sim

# 7) デプロイ
npx wrangler pages deploy dist --project-name opcg-sim
#    → https://opcg-sim.pages.dev などで公開
```

以降の更新は `npm run build && npx wrangler pages deploy dist --project-name opcg-sim`。

---

## B. GitHub 連携で自動デプロイ（push で自動ビルド）

Cloudflare ダッシュボード → **Workers & Pages → Create → Pages → Connect to Git** → `Gqia613/onepiece-tcg` を選択。

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- **Settings → Functions → D1 database bindings**: 変数名 `DB` = 作成した `opcg`
  （wrangler.toml の binding が反映されない場合はここで手動追加）
- **Settings → Environment variables (Production) → Secret**: `JWT_SECRET`・`INVITE_CODE`（＋必要なら `ANTHROPIC_API_KEY`）を追加

→ 以後 `main` への push で自動ビルド＆デプロイ。D1 のスキーマ適用（A の手順3）は最初に一度だけ必要。

---

## C. AI対戦を有効化（任意）

- `ANTHROPIC_API_KEY` をシークレットに設定（未設定なら `/api/ai` は `no_api_key`＝ログイン/デッキには影響なし）。
- （任意）応答キャッシュ用 KV:
  ```bash
  npx wrangler kv namespace create AICACHE
  ```
  出力の id を `wrangler.toml` の `[[kv_namespaces]]`（コメント解除）に貼る。
- 1ユーザー/日の上限は `functions/api/ai.js` の `DAILY_LIMIT`(=1000)。

---

## D. オンライン対戦（realtime Worker — Pages とは別デプロイ単位）

オンライン対戦（部屋コード制・ロックステップ中継）は **`realtime/` の独立 Worker `opcg-realtime`**（MatchRoom Durable Object）が担う。
main への push では**デプロイされない**＝realtime を変更したら手動デプロイが必要。

```bash
# 1) デプロイ（realtime/ で実行。wrangler v4 は realtime/package.json の devDependency）
cd realtime && npm install && npx wrangler deploy
#    → https://opcg-realtime.opcg-sim.workers.dev

# 2) トークン署名鍵（Pages と Worker で同一値。セッション用 JWT_SECRET とは独立）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put JWT_SECRET                    # ← realtime/ で（Worker 側）
cd .. && npx wrangler pages secret put MATCH_JWT_SECRET --project-name opcg-sim   # ← 同じ値

# 3) Pages に Worker の URL を設定（/api/match/token が返す接続先）
npx wrangler pages secret put REALTIME_URL --project-name opcg-sim
#    値: https://opcg-realtime.opcg-sim.workers.dev
```

- Worker は Pages と同じ D1（binding `DB`）を持つ（`realtime/wrangler.toml`）＝戦績＋リプレイの書き込み先。
  読み出しは Pages の `/api/match/history`・`/api/match/replay`。`matches` テーブルは `npm run d1:remote` で作成。
- 疎通確認: `curl https://opcg-realtime.opcg-sim.workers.dev/healthz` → `{"ok":true}`
  （★workers.dev サブドメイン新設直後は `*.opcg-sim.workers.dev` の証明書発行待ちで数分〜数時間 TLS エラーになることがある）
- 許可オリジンは `realtime/wrangler.toml` の `ALLOWED_ORIGINS`（+ `*.opcg-sim.pages.dev` プレビューはコードで許可）。
- `REALTIME_URL` 未設定でも本体は無影響（オンラインロビーが「サーバ未設定」を表示するだけ）。
- ローカル: `cd realtime && npm run dev`（:8787）+ ルート `npm run pages:dev`。ルート `.dev.vars` に `REALTIME_URL=http://127.0.0.1:8787`、`realtime/.dev.vars` にルートと同じ `JWT_SECRET`。
- 実DO統合テスト: `OPCG_E2E=1 npx vitest run tests/online-e2e.test.ts`（wrangler dev を自動起動して1局完走）。

---

## ローカル確認（デプロイ前）

```bash
npm run build
npm run d1:local     # ローカル D1 にスキーマ適用
npm run pages:dev    # http://localhost:8788（.dev.vars の JWT_SECRET を使用）
```

`.dev.vars`（gitignore 済み）にローカル用 `JWT_SECRET` 等を置く（雛形は `.dev.vars.example`）。

---

## トラブルシューティング

- ログインで 500 / `no_db` → D1 binding `DB` 未設定 or `wrangler.toml` の `database_id` 未反映。
- ログイン直後にログアウト状態 → `JWT_SECRET` 未設定（署名検証に失敗）。本番は必ず設定。
- 新規登録できない（`registration_closed`）→ `INVITE_CODE` 未設定。招待コードを配る運用なら設定する。
- 新規登録が `bad_invite` → 入力した招待コードが `INVITE_CODE` と不一致。
- AI が動かない → `ANTHROPIC_API_KEY` 未設定（ログイン/デッキ保存には不要）。

> 補足: エンジン/AI 学習は `engine/`（Node・ビルド不要）にあり、Pages のビルド（`npm run build`＝`dist/`）には含まれない。web は起動時に `src/engine/raw/`（同梱コピー）を使うためデプロイに影響しない。

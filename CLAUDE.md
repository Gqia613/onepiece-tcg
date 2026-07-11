# CLAUDE.md

このリポジトリで Claude Code が作業するための指示書（プロジェクトメモリ）。応答は日本語・簡潔に。

---

## 0. 構成（2026-07 web/ 単一化）

ワンピースカードゲーム（OPCG）**対戦シミュレーター**。**リポジトリのルート＝web アプリ**（React 18 + Vite + Cloudflare Pages/Functions + D1）。
バニラのエンジン一式は **`engine/` サブフォルダ**に集約（旧バニラ静的画面 `index.html`+`css/` は削除済み）。

```
/ (ルート = web アプリ)
  index.html            # web エントリ（Vite）
  src/                  # ★React アプリ
    screens/            # Home / Login / DeckSelect / Decks(マイデッキ) / DeckBuilder / Battle
    components/         # battle/*・fx/*・deck/*
    engine/             # エンジンの React 連携（bootstrap / reactAdapter / ui-adapter / types / img / interaction / rarity）
      raw/              # ★engine/ からの同梱コピー（scripts/sync-engine.mjs が生成・手編集しない）
    state/ api/ audio.ts styles.css battle.css
  functions/api/        # Cloudflare Pages Functions: auth・me・logout・decks・ai（Claude プロキシ）・match/token（オンライン対戦）・_middleware
  realtime/             # ★オンライン対戦の独立Worker（MatchRoom Durable Object＝入力のseq採番・中継・記録のみ。別デプロイ単位: cd realtime && npx wrangler deploy）
  src/net/              # オンライン対戦のクライアント側（protocol / dispatch=ロックステップ / matchClient=WS / onlineGame=進行制御）
  public/bgm/           # BGM mp3（battle/casual/adventure/wafu。src/audio.ts と対・ビルドで dist/bgm/ へ）
  scripts/              # sync-engine.mjs（engine/ 原本 → src/engine/raw/ へ verbatim 同期）・gen-rarity.mjs
  tests/                # web(vitest) テスト
  package.json vite.config.ts tsconfig.json wrangler.toml schema.sql DEPLOY.md

  engine/               # ★バニラ OPCG エンジン + AI 学習（CommonJS・Node のみ・ビルド不要・UI なし）
    CLAUDE.md           # ★エンジン/AI/カード効果の詳細ルール（エンジンを触る前に必ず読む）
```

**要点**: web アプリは `engine/` のエンジンを `scripts/sync-engine.mjs` で `src/engine/raw/` へ同梱コピーして動く（web は自己完結・ビルド/起動にルートの `engine/` は不要）。

---

## 1. よく使うコマンド

```bash
# ── web アプリ（ルートで実行）──
npm run dev        # Vite 開発サーバ
npm run build      # tsc -b && vite build
npm test           # vitest（全テスト）
npm run pages:dev  # Cloudflare Pages Functions 込みで起動（/api を使う場合）

# ── エンジン改修を web に反映 ──
node scripts/sync-engine.mjs   # engine/ 原本 → src/engine/raw/

# ── バニラエンジン + AI（engine/ で実行）──
cd engine && node tests/test.js              # 全自動検証（10ステップ）
cd engine && node tools/measure-matchup.js   # AI マッチアップ測定

# ── D1（マイグレーションfile方式ではなく、冪等な schema.sql を再適用する方式）──
npm run d1:local   # ローカル D1 へ schema.sql 適用
npm run d1:remote  # 本番 D1 へ schema.sql 適用
```

---

## 2. デプロイ・本番環境（詳細は DEPLOY.md）

- 本番: **https://opcg-sim.pages.dev**（Cloudflare Pages・プロジェクト名 `opcg-sim`）
- GitHub 連携済み＝ **main へ push すると自動ビルド・デプロイ**。手動デプロイは `npm run build && npx wrangler pages deploy dist --project-name opcg-sim`
- D1 テーブル: users / decks / ai_usage / login_attempts（`schema.sql`。database_id は `wrangler.toml`）
- シークレット/バインディング: `DB`(D1)・`JWT_SECRET`・`INVITE_CODE`（招待コード登録ゲート。**未設定だと新規登録が閉じる**）・`ANTHROPIC_API_KEY`/`ANTHROPIC_VERSION`・`AICACHE`(KV)。ローカルは `.dev.vars`
- AI プロキシ（functions/api/ai.js）には日次上限 `DAILY_LIMIT=1000` がある

---

## 3. 作業のルール

- **カード効果・エンジン・AI を触るときは必ず `engine/CLAUDE.md` を読む**（公式カードリストでの効果照合、ドン状態モデル、fx スキーマ、AI の現在地と測定の掟、系統バグの型が全てそこにある）。
- **エンジン（`engine/src` 等）を変更したら**: ① `cd engine && node tests/test.js` を緑にする ② `node scripts/sync-engine.mjs` で web へ同梱コピーを更新 ③ web の `npm test` / `npm run build` を通す。
- **web を変更したら**: `npm run build` と `npm test` を通す。React コンポーネント（screens/components）と CSS（`src/styles.css`＝静的シェル / `src/battle.css`＝盤面・デッキ選択・演出）を編集。
- `src/engine/raw/` は手編集せず sync で更新する。
- **localStorage/sessionStorage を使わない**。状態は engine の `G` / web の zustand ストアに持つ。
- **オンライン対戦（ロックステップ）を壊さないための不変条件**: ①ゲーム結果に効く乱数は必ず `rng()`（Math.random は演出専用） ②人間/CPU の分岐は `isCPU` のみ ③エンジンのプロンプトには `side`（決定者の席）を付ける ④UI専用の確認は `local:true` ⑤G に非対称なフィールドを足すときは `hashGameState` の `_HASH_SKIP`（engine/src/70-ai.js）を確認。回帰は `tests/lockstep.test.ts`（2エンジン並走のhash一致）が検出する。
- PM・実験の一次資料は **`engine/docs/pm/`**（experiments.md＝実験台帳・current-status.md）と **`engine/docs/ai-design.md`**。ルート直下の `docs/` は web UI 仕様（phase3-ui-spec.md 等）。
- 応答は日本語・簡潔。

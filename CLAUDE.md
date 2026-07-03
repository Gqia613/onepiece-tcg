# CLAUDE.md

このリポジトリで Claude Code が作業するための指示書（プロジェクトメモリ）。応答は日本語・簡潔に。

---

## 0. 構成（2026-07 web/ 単一化）

ワンピースカードゲーム（OPCG）**対戦シミュレーター**。**リポジトリのルート＝web アプリ**（React 18 + Vite + Cloudflare Pages/Functions + D1）。
以前あったバニラ版の静的画面（`index.html` + `css/styles.css`）は削除し、バニラのエンジン一式は **`engine/` サブフォルダ**へ集約した（web を1階昇格）。

```
/ (ルート = web アプリ)
  index.html            # web エントリ（Vite）
  src/                  # ★React アプリ
    screens/            # Login / DeckSelect / DeckBuilder / Battle
    components/         # battle/*・fx/*・deck/*
    engine/             # エンジンの React 連携（bootstrap/reactAdapter/ui-adapter/types）
      raw/              # ★engine/ からの同梱コピー（scripts/sync-engine.mjs が生成・手編集しない）
    state/ api/ audio.ts styles.css battle.css
  functions/            # Cloudflare Pages Functions（api/auth・api/decks・api/ai プロキシ）
  scripts/sync-engine.mjs  # engine/ の原本 → src/engine/raw/ へ verbatim 同期
  tests/                # web(vitest)テスト
  package.json vite.config.ts tsconfig.json wrangler.toml schema.sql

  engine/               # ★バニラ OPCG エンジン + AI 学習（CommonJS・Node のみ・ビルド不要）
    package.json        # "type":"commonjs"（ルートの type:module から分離）
    src/00..70-*.js     # ゲームエンジン本体（クラシック<script>連結想定・グローバル共有）
    cards.js cards-fx.js cards-attr.js   # カードDB / 効果fx / 属性
    tools/              # AI学習・カード公式照合（az-export/selfplay-*/measure-matchup/official-opNN 等）
    pytorch/            # AlphaZero 学習（train.py・data/・out/。data/out/.venv は gitignore）
    tests/              # エンジン回帰（test.js が全検証・_load-app.js が本体JSを連結）
    docs/               # 効果設計・AI設計・攻略ガイド
    decks/              # サンプルデッキ JSON
    CLAUDE.md           # ★エンジン/AI/カード効果の詳細ルール（作業前に必ず読む）
```

**要点**: web アプリは `engine/` のエンジンを `scripts/sync-engine.mjs` で `src/engine/raw/` へ同梱コピーして動く（web は自己完結・ビルド/起動にルートの `engine/` は不要）。AI 学習は `engine/` の Node ツールが `engine/src` を回して自己対戦データを生成し `engine/pytorch/train.py` で学習する。

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
cd engine && node tests/test.js   # 全自動検証（構文/デッキ/CPU対CPU/フリーズ/効果/AI基盤…）
cd engine && node tools/measure-matchup.js   # AI マッチアップ測定
```

---

## 2. 作業のルール

- **カード効果・エンジン・AI を触るときは必ず `engine/CLAUDE.md` を読む**（公式カードリストでの効果照合、ドン状態モデル、fx スキーマ、AI 設計と測定駆動など、最重要ルールが全てそこにある）。
- **エンジン(`engine/src` 等)を変更したら**: ①`cd engine && node tests/test.js` を緑にする ②`node scripts/sync-engine.mjs` で web へ同梱コピーを更新 ③web の `npm test` / `npm run build` を通す。
- **web を変更したら**: `npm run build` と `npm test` を通す。React コンポーネント（screens/components）と CSS（`src/styles.css`＝静的シェル / `src/battle.css`＝盤面・デッキ選択・演出）を編集。
- `engine/src/engine/raw/` ではなく `src/engine/raw/`（web 側）が同梱先。`raw/` は手編集せず sync で更新する。
- **localStorage/sessionStorage を使わない**。状態は engine の `G` / web の zustand ストアに持つ。
- 応答は日本語・簡潔。

---

詳細（カード効果の実装手順・公式照合フロー・ドンの状態モデル・AI の設計と到達点・既知バグ）は **`engine/CLAUDE.md`** を参照。

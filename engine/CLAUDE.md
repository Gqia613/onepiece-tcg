# CLAUDE.md（engine/ ＝バニラエンジン + AI）

このディレクトリで Claude Code が作業するための指示書。応答は日本語・簡潔に。
**engine/ は Node 専用（CommonJS・ビルド不要・UI なし）。** UI はリポジトリルートの React web が担当（全体像はルートの `CLAUDE.md`）。エンジン改修を web に反映するには、ルートで `node scripts/sync-engine.mjs` → web の `npm test` / `npm run build` を通す。

---

## 0. 概要と構成

ワンピースカードゲーム（OPCG / ワンピカード）**対戦シミュレーター**のゲームエンジン＋AI学習基盤。

```
engine/
  package.json        # "type":"commonjs"（ルートの type:module から分離＝従来どおり require で動く）
  src/                # 本体JS。クラシック<script>連結想定＝全ファイルが1つのグローバルスコープを共有
    00-data.js          # 定数(IMG/COLOR_HEX)・C・def()・DECKS・mergeCardDB() IIFE（効果fxは持たず cards-fx.js に一元化）
    10-engine-core.js   # G・inst/buildPlayer/startGame・マリガン・ドン状態・checkCond/power/フィルタ
    20-targeting-fx.js  # chooseCard/humanPick/cpuPick・runFx・doOp（効果実行エンジンの巨大switch）
    30-flow-battle.js   # summon/除去・ターン進行・バトル解決(declareAttack等)・リーダー固有ロジック
    40-ui-render.js     # render/log/toast/アニメ（web では reactAdapter 経由で利用）
    50-input-cpu-ai.js  # プロンプト/入力ハンドラ・CPUヒューリスティック・AI連携(callClaude)
    60-screens-init.js  # デッキ選択・デッキビルダー・CPU強さトグル(setCpuStrength)・init
    70-ai.js            # 強いCPU基盤: 決定化MCTS・puct探索・evalState・AGENTS。詳細 docs/ai-design.md
    ai-weights.js       # 学習済み盤面評価の重み（現在 null＝手作りeval既定。手編集禁止・selfplay-train.js が生成）
    ai-policy.js        # 出荷方策ネット（puct の prior 用・リーダー別合成方策）
    ai-strategy.js      # Claude 戦略（hybrid 用）
  cards.js            # 全カードDB 3065枚（tools/scrape-cards.js が公式から生成・dataOnly）
  cards-fx.js         # ★全カードの効果fxを一元化（番号→fx。fx 2330件・トリガー580枚含む）
  cards-attr.js       # 属性（斬/打/射/特/知。tools/scrape-attributes.js 生成・2211枚）
  cards-trigger.js    # トリガー文（tools/gen-cards-trigger.js 生成。mergeCardDB が base.triggerText 付与）
  cards-sets.js       # 収録弾（tools/gen-cards-sets.js 生成。mergeCardDB が base.sets 付与）。★「弾」＝番号の接頭辞ではない
                      #   （スタートデッキは他弾からの再録で構成される。web のデッキビルダーの弾フィルタが参照）
  tools/              # scrape-official-full.js（公式の全フィールド完全スナップショット official-full.json＝照合の正本）
                      # scrape-qa.js（公式Q&A全件 → official-qa.json＝裁定の正本その2。新弾時に再実行）
                      # qa-lookup.js（Q&A参照CLI: <番号…> / --set <SET> / --search <kw> / --rules / --stats）
                      # audit-cards.js（三点照合 official-full↔C↔CARD_FX → audit-report.json）
                      # lint-fx.js（fx静的リント: 実在しないop/フック名=ERROR・漏れ疑い=WARN）/ fx-fire-coverage.js（fx発火ゼロ診断）
                      # scrape-cards / scrape-attributes / gen-cards-trigger / official-opNN.js（弾別の公式効果文の正本）
                      # measure-matchup.js（★A/B測定の標準: 同一seedペア比較＋符号検定）
                      # selfplay-train / selfplay-puct / selfplay-value / selfplay-iterate / az-export / az-advantage
                      # analyze-heuristic / compare-dumps / plan-diagnose / puct-depth-probe / train-policy
  pytorch/            # AlphaZero 学習（train.py・MPS。data/ out/ .venv は gitignore）
  tests/              # test.js（全自動検証・10ステップ）/ _load-app.js（本体JSを所定順に連結する共有ヘルパー）/ stubs.js
                      # cpu-vs-cpu / human-fuzz / unit-example / fx-cards / custom-decks / deck-builder / arena / ai-core / ai-hybrid-prompt
  docs/               # opcg-effect-system-design.md（効果の統一設計。★§12＝実装準拠の全op/フィルタ/条件/タイミング一覧）
                      # ai-design.md（AI設計と全知見・実験の詳細）/ card-audit-workflow.md（全カード照合の手順）
                      # deck-strategies.md / deck-lines.md / opcg-playing-principles.md / cloud-setup.md
                      # pm/experiments.md（★実験台帳 E01〜E47）/ pm/current-status.md
                      # claude-md-archive-20260709.md（本ファイルの旧 §8/§9＝実験史・実装史・バグ全記録の退避先）
  decks/              # サンプルデッキ JSON
```

**★クラシック `<script>` 連結の鉄則**: ①同名の `const`/`let` を2ファイルに置くと連結時 SyntaxError ②ロード時に即実行される文（`mergeCardDB()` IIFE・`def()` 群）は依存順を厳守（`def` 定義・`def()` 群・`mergeCardDB` は必ず `00-data.js` に同居）③関数定義は呼出時に全ファイルロード済みなので前方参照OK。**ES Modules 化しない。** テストは `tests/_load-app.js` が cards.js/cards-fx.js を前置し src/*.js を所定順に連結して Node 実行する。

---

## 1. 絶対に守るルール（HARD RULES）

1. **カード効果は必ず公式カードリストで検証する。** 一次ソースは `https://www.onepiece-cardgame.com/cardlist/`。
   未確認の効果を推測で書かない。確認できないときは「未確認」と明示する。過去のドラフトにはコスト・効果文・カード種別の誤りが多発した。
2. **日本語の情報源のみ使う。** 海外は発売が遅く環境が異なる。除外: spellmana.com / onepiecetopdecks.com / onepiece.gg / opmetagame.com / limitlesstcg.com。
   許可: 公式サイト、cardrush-op.jp、akihabara-cardshop.com、meli-melo.blog.jp、note.com、tcg-portal.jp。検索クエリは日本語で。
3. **効果を変更/追加したら必ずテストを通す。** 最低 `node tests/test.js`。新しい効果は `tests/unit-example.js` を参考にユニットテストを追加する。
4. **記事のデッキ/実装を丸コピーしない。** ルールの構造から論理的に実装する。
5. 応答は **日本語・簡潔**。

---

## 2. よく使うコマンド

```bash
node tests/test.js              # 全自動検証（10ステップ: 構文/デッキ整合/CPU対CPU30戦/人間オートパイロット30戦/ユニット/Phase3効果/カスタムデッキ30戦/デッキビルダー/AI基盤/AIモードプロンプト）
node tests/unit-example.js      # カード効果ユニットテスト（新効果はここに足す）
node tools/measure-matchup.js   # AI改良のA/B測定（同一seedペア比較＋符号検定）
node tools/audit-cards.js       # 公式との三点照合 → tools/audit-report.json
```

依存は Node.js のみ（ビルド不要）。**engine/ に index.html・css は無い**＝ブラウザでの動作確認はルートで `npm run dev`（web 側）。

---

## 3. アーキテクチャ

### 3.1 グローバル状態 `G`
対戦の全状態。`G.active`（'me'|'cpu'）, `G.busy`, `G.myActable`, `G.winner`, `G.turnSeq`, `G.firstPlayer` など。
`G.players[side]` = `{ isCPU, leader, chars[], hand[], life[], deck[], trash[], stage, don:{active,rested}, donMax, turnsTaken, ... }`。
各カード = `{ no, base(=C[no]), owner, uid, attachedDon, rested, buffs[], kwGrant[], frozen, ... }`。ライフカードは `_faceUp` を持つことがある。

### 3.2 カード定義 `C` と `def()`
`def(c){ C[c.no]=c }` で登録。カードは `{ no, name, color[], type:'LEADER'|'CHAR'|'EVENT'|'STAGE', cost, power, counter, traits[], leader, ...kw..., fx, text }`。`text` は必ず公式テキストと一致させる。

### 3.3 効果スキーマ `fx`（タイミング別）
`fx.onPlay`【登場時】/ `fx.onAttack`【アタック時】/ `fx.onKO`【KO時】/ `fx.trigger`【トリガー】/ `fx.static`（永続・都度評価）/ `fx.act`【起動メイン】`{label,cost,fx}`（リーダーも可）。ほか多数のフック（onBlock/onAllyEnter/onOppAttack/onTurnEnd 等）。
- **全カードの効果は `cards-fx.js`（番号→fx）に一元化**。`def()` はメタ情報のみで fx を持たない。新効果も必ず cards-fx.js に追加し、`tests/fx-cards.js` に検証ケースを足す。fx は「プレーンな op オブジェクト」で書く（ヘルパー関数は使わない）。
- **最新の全タイミング/コスト/アクション/フィルタ/条件の一覧は `docs/opcg-effect-system-design.md` §12（実装準拠）を必ず参照。**

### 3.4 効果の実行エンジン `doOp(op, ctx)`
すべてのアクションは op オブジェクトで表現し、`doOp` の巨大 switch が実行。`runFx(ops, ctx)` が配列を順に解決（各 op は try/catch・例外は握りつぶしてログ）。
op のカテゴリ: コスト系（`{op,..,then}` 形: discardCost/restDonCost 等）／除去（ko/bounce/deckBottom…）／ロック・妨害／コスト操作（staticCost/costMod）／パワー（powerMod/condBuff…）／リソース（draw/search/scry…）／展開（playCharFromHand…）／ドン（donAttach/donMinus…）／ライフ／状態（negate/giveKeyword…）／制御（cond）。**完全な一覧は設計図 §12。**

### 3.5 描画とフック
- `render()` は盤面を毎回作り直す。残したい一時要素（勝敗画面等）は `document.body` 直付け。文字列を innerHTML に差すときは `escapeHTML()`（特に `name`）。カード画像は `IMG(no)`（weserv 経由の公式ホットリンク）。
- **★誘発効果の割り込み規則（公式準拠）**: 効果の解決中に誘発した自動効果は即時実行せず `G._pendingReacts` に予約→**最外の runFx 完了後に**順次発動（`G._fxDepth` で深度計測・`drainReacts` でドレイン）。キュー化済み: fireLifeLeft/fireSimpleReact/fireDonReturned/fireOwnRest。**新フックを足すときもこのキュー化パターンに従う**。「発動できる」任意自動効果は `cfg.optional:true` で確認（辞退・条件不成立は【ターン1回】未消費）。
- バトルのフック順序（`declareAttack` で固定。崩さない）:
  `アタック宣言 →【アタック時】→ 対象変更 → ブロック → カウンター → パワー比較 → ダメージ(ライフ/トリガー or KO/【KO時】)`

---

## 4. ★ドンの状態モデル（バグ多発ポイント・最重要）

| 操作 | 取る場所 | 実装 |
|---|---|---|
| プレイヤーの手動付与 | コストエリアの **アクティブ** | `attachDonFlow`（`P.don.active` から） |
| 効果「**レストのドン!!を付与**」 | コストエリアの **レスト** | `donAttach`/`donAttachAll`（`P.don.rested` から。レスト0なら付与0） |
| ドン!!-N | どこからでも → **ドンデッキへ戻す** | `donMinus`→`returnDonChoose`（`donTotal` が減る） |
| リフレッシュ | 付与ドンとレストを全てアクティブへ | `beginTurn()` の冒頭 |

- `donTotal(side) = active + rested + Σ attachedDon`。「ドンデッキ残 = `donMax` − `donTotal`」。
- エネル（`donDeck:6`）はドン-1イベントでドンをドンデッキに戻し毎ターン引き直す**循環**で成立。リーダー効果は「1枚アクティブ＋最大4枚レスト追加→レストのドン最大4付与」を**常に実行**。
- 新しい付与系効果は、テキストが「レストのドン」なら必ず `donAttach`（レスト）。**アクティブから付与するのは手動付与と `fromAny` 明記の効果だけ。**

---

## 5. テストの仕組みと注意点

- `node tests/test.js` が全体検証。`tests/stubs.js` を前置して各ハーネスを Node 実行する。
- **タイマーは setImmediate ベース**（stubs.js）。`setTimeout(0)` のままだとテストの密ループがゲームの連続 `sleep` を飢餓させ「停止」を**誤検知**する（実ブラウザでは起きない）。新しいテストもこのスタブを使う。
- **★スモークテストの罠**: `await sleep()` を含む処理を `Promise.race([p, setTimeout(HANG)])` で囲うと、`setTimeout=setImmediate` 化により race 側が先に発火しフリーズを誤検知する。実機ハング判定は**本物の setTimeout を退避して**使う。
- 合格条件: CPU対CPU `noWinner=0 doubleAttacks=0`／人間オートパイロット `真の停止: 0` かつ `クリック不能プロンプト: なし`。
- ユニットテストの型は `tests/unit-example.js`（最小の `setupG()`→`doOp`/`leaderActivate`→assert）。**効果を追加・修正したら必ず1ケース足す。**

---

## 6. カード効果の実装手順

1. **公式カードリストで効果テキストを確認**し `text` に正確に転記（No./コスト/パワー/カウンター/色/特徴/効果全文）。
2. 設計図 §1 の4要素に分解（タイミング/条件/コスト/アクション）→ 既存 op で表現できるか確認（§12）。足りなければ `doOp` に op を追加（命名は既存に倣う）。
3. **「できる」「〜まで」=任意（`optional:true`・0個可）、「する」=強制。** 空対象でフリーズしないこと（候補0で null 解決）。
4. **期限**を持たせる（このバトル中/このターン中/次の相手エンドフェイズまで。`turnEnd`/`battle`/`ownerNextStart`/`oppNextEnd` タグ）。失効漏れに注意。
5. `tests/unit-example.js`（または `tests/fx-cards.js`）にテスト追加 → `node tests/test.js` が緑になるまで直す。
6. §11 の「系統バグの型」を自己チェックしてから完了とする。

**新弾が出たときのワークフロー**（詳細 `docs/card-audit-workflow.md`）:
`tools/` の SERIES 追加 → `scrape-official-full` → `scrape-cards` → `scrape-attributes` → `gen-cards-trigger` → `audit-cards` で差分列挙 → 実装 → `fx-cards` に回帰追加。
**効果の正しさは「公式テキストとの意味照合」でしか担保できない**（構造チェック＝例外/フリーズ検出だけでは効果の誤りは見つからない）。照合の正本は `tools/official-full.json`＋弾別 `tools/official-opNN.js`。**裁定の正本は `tools/official-qa.json`**（text確認の直後に `node tools/qa-lookup.js <番号>` で必ずQ&Aも照合。裁定が挙動に効くQ&Aはテストケース化）。

---

## 7. コーディング規約・落とし穴

- src/*.js のクラシック連結構成を維持（§0 の鉄則）。新規コードは役割に合う src ファイルへ。外部JSは CDN（cdnjs）のみ。
- **localStorage/sessionStorage を使わない**。状態は `G` に持つ（web 側は zustand）。
- `render()` 後に DOM へ付けた一時要素は消える。残したいものは `document.body` 直付け。
- バトルのフック順序（§3.5）を崩さない。
- 大きな変更後は必ず `node tests/test.js`。エンジン変更は web への sync（冒頭）まで含めて完了。

---

## 8. 現在地（2026-07-09 時点）

- **カード: 全3145枚が公式と完全一致**（トリガー591件含む・audit 差分ゼロ）。OP-01〜16 全弾＋EB/ST-01〜36/P/PRB。**2026-07-13 に新スタートデッキ ST-31〜36（赤ルフィ/緑ゾロ/青クザン/紫カタクリ/赤黒サボ/黄キッド）の新規30枚を実装**（他50枚は既存カードの別イラスト `_rN`＝fxはbaseNoから自動継承）。既知近似5種（scry 完全実装/残り配置選択/コスト原子性/同一対象除外/バトル終了時フック）も解消済み。残: CPU のトリガー判断品質・実機 E2E は目視のみ。
  - ST31〜36 で入れたエンジン拡張3件: cond `selfHandDiscardedThisTurn`（ST33-004）/ `lifeCost` の `ctx._declined/_committed` と `pos:'choose'` の faceUp・faceDown 対応（ST36-005）/ アタック中断時の `G._counterRedirect` クリア。スクレイパーは全角「／」区切りの特徴にも対応（OP05-059・OP06-057 が複合特徴のままだった）。
  - 2026-07-18 実対戦指摘: `counterRedirect`/cond `selfChar` に `incLeader`（「キャラ」限定でない対象変更はリーダーも可＝ST36-005→黄キッドL）。【相手のアタック時】発の対象変更は**ブロック前に即時反映**（従来はカウンター後まで遅延し「切り替わらない」ように見えた。カウンターイベント発=EB01-038は従来どおりカウンター後）。OP10-099 の付与先選択に `optional:true`（「1枚まで」＝候補1枚でも自動確定せずモーダル表示）。cond 新キー `lifeEndsFaceUp`（ライフの一番上か一番下が表向き＝Q&A1412）＋ onOppAttack は**全condが不成立ならカットイン(fxNote)を出さない**（毎アタック出ると「発動しようとして失敗」に見える誤解対策）。【ダブルアタック】vs ライフ1枚は**1枚削るだけで勝利にならない**（公式Q&A36/400: 2発目以降はライフ1枚以上の時だけ処理。敗北は「ライフ0の状態で新たに被弾」のみ。`dealLeaderDamage` の t>0 でライフ0なら break）。
- **AI: 既定 CPU = heuristic（不変）。「強いCPU/AIモード」= puct 探索（opt-in・デッキ選択画面のトグル）**。`PUCT_DEEP {det:9,look:2,width:8}` を lucy/ace/nami/hancock/teach に適用（対 heuristic 平均 +19.7pt）。enel は puct/hybrid とも不適合 → `PUCT_MCTS={enel:1}`（mcts 直行）＋`HYBRID_SKIP={enel:1}`。`STAGE_PLAY={teach:1}`（heuristic の STAGE 設置・teach のみ既定）。`DON_DIFF_W={teach:0.15,hancock:0.15}`。`ai-weights.js` は null（手作り eval 既定）。`ai-policy.js` は puct の prior 用合成方策を出荷。
- **結論: 現 puct（+E46）が単機の天井。** 学習系（value/policy/AlphaZero 単機、クラウドは見送り）・計算スケール・LLM 戦略・判断精密化系のレバーは**全て実測で棄却済み**。効いたのは「物理的にできなかった行動を可能にする」型のみ（STAGE 設置・太ドン同値抑制・エネル付与先修正）。残レバー = ユーザーのプレイ観察 → heuristic 修正。
- **E48（2026-07-10・✅有意採用）**: 黒ヤマトのコンボライン。ユーザー観察（5cおでん過多・モモコンボ不発=9cモモ0.03回/側を実測）→ `DECK_PLANS.lines`＋`lineTurn`（ラインを強制せず決定化ロールアウトで自然手とMARGIN比較＝非退行）→ ミラーN=120×2帯 +3.3/+6.7pt(p=0.021★)。`LINE_PLAY={'_OP16-079':1}` で既定化。**linesの勝ちパターン=「定石がコスト順プレイと乖離するデッキ」限定**（teach/hancockでは不発=E47）。ライン正本は `docs/deck-lines.md`。非curatedリーダーの byLeader キーは番号キー（'_OP16-079'）。
- **E49（2026-07-10・✅有意採用）**: 縁切り(OP16-099)経由のヤマトライン3本＋**対象steering `G._linePick`**（蘇生/回収の既定cpuPick=パワー最大がコンボを壊す→ライン実行中だけ宣言した優先noを自陣対象選択で優先）。lineh2単離測定でE48比 **+7.5pt(p=0.012★)/+9.2pt(p=0.001★)の2帯有意**→exp昇格。**学び: linesは対象steeringとセットで初めて機能する**。
- **E53（2026-07-16・✅3部品有意採用）**: 本番D1の実対戦リプレイ（青緑ルフィvs緑ミホーク4戦）を `scripts/replay-dump.ts` で解析→リーダー起動まわりの構造欠陥3つを修正（`E53_DEF`）: restpick=restOwnAsCostのレスト対象選択（従来pool[0]=リーダー固定・単離+27.5pt★）／actgate=コスト→cond不成立の起動抑止（+10.0pt★）／luffyact=無償ドン起動を展開予算に組込（2帯+9.2/+10.8pt）。puctのlegalActionsにリーダーfx.actも列挙（番号キーリーダーの起動が探索に不可視だった）。プリセットに緑ミホーク新設・青緑ルフィは実戦リストへ差し替え。詳細 `docs/pm/experiments.md` E53。
- **E56（2026-07-20・✅採用）**: モバイル発熱対策 `G._puctCap`＝探索量の上限（min適用）。web がタッチ端末のみ `{det:6,width:6}`（deep 9/2/8→6/2/6・ロールアウト約半減）を設定。強さは同一seedペア240組で有意差なし（合算 改善15/退行18 p=0.728）。詳細 `docs/pm/experiments.md` E56。
- **E57（2026-07-23・✅採用）**: CPUイベント無駄撃ちゲート `evgate`（`E57_DEF`）＝mainの先頭コスト（restDonCost/donMinus/revealCost/discardCost）が支払い不能・先頭condや「コスト→単一cond包み」（OP16-038型）が不成立のイベントを能動プレイしない。**fx-fire-coverage（発火の質監査）の[A]トリアージ由来**（無駄撃ち9回/30試合を実測→採用後0）。luffygb vs mihawk 2帯 +3.3/+2.5pt・合算 改善8/退行1(p≈0.039★)。詳細 experiments.md E57。
- 既知の未対応: 実験→出荷物の分離ガードレール（E32 事故の再発防止）。
- **経緯・全実験の詳細は `docs/pm/experiments.md`（台帳 E01〜E47）と `docs/ai-design.md`。本ファイルにあった詳細履歴の全文は `docs/claude-md-archive-20260709.md` に退避済み。**

---

## 9. 実験・測定の掟（再発防止の核）

- **複数局を回すハーネスは各局終了後に必ずイベントループをドレイン**（`for(k<40) await setImmediate`）。前局の保留タスク持ち越しで測定・学習データが汚染される（過去の測定値が全滅した最重大バグ）。
- 改善判定は `tools/measure-matchup.js` の**同一 seed ペア比較＋符号検定**で（N=30 はノイズ ±9% で判定不能）。puct 系への上乗せ改良は `OPCG_BASE=puct` の直接ペア比較。
- 実験の型: ①opt-in フラグで既定バイト不変 ②部品単離（`OPCG_THR`/`OPCG_H2`） ③2 seed 帯で符号再現 ④per-leader 採用（一律適用は他リーダーを壊す）。
- **「検証精度≠強さ・アリーナが正」**。特徴量・資源項目は arena/measure 確認後に1つずつ。evalState への資源項目はリーダー別が必須。
- 先読み後の状態復元は「元オブジェクト参照」を戻す（`loadGameState(複製)` の差し替えは実プレイ劣化）。rng は `rngState` で隔離。ロールアウトは `_noChain` 完全 await（残留 async 防止）。

---

## 10. AI フラグ・環境変数 早見表

定義場所は `src/70-ai.js`・`src/50-input-cpu-ai.js`・`tools/` 各ハーネス（grep で確認できる）。

| フラグ | 意味 |
|---|---|
| `G.players.cpu.agent` | CPU エージェント切替（'heuristic' 既定 / 'mcts' / 'puct' / 'hybrid' / 'vlook' / 'npolicy' 等＝`AGENTS` 登録名） |
| `PUCT_DEEP` / `PUCT_DEPTH` | puct 探索の深さ（det9/look2/w8 を5リーダーに適用。未知リーダーは標準 det3/1/5） |
| `PUCT_MCTS={enel:1}` | enel は puct でなく mctsTurn へフォールバック（旧 PUCT_SKIP の後継） |
| `HYBRID_SKIP={enel:1}` | hybrid の enel は Claude 戦略シェイプなしで puct→mcts 直行 |
| `STAGE_PLAY={teach:1}` | heuristic の STAGE 設置ステップ（teach のみ既定 ON） |
| `LINE_PLAY={'_OP16-079':1}` | 既定CPUのコンボライン候補化（黒ヤマトのみ既定 ON。ライン定義は `ai-strategy.js` の `DECK_PLANS.lines`・正本 `docs/deck-lines.md`。opt-in測定は `OPCG_AGENT=lineh`） |
| `DON_DIFF_W` | evalState のドン差項の重み（リーダー別。teach/hancock=0.15） |
| `AI_WEIGHTS` | 学習済み盤面評価（null=手作り eval にフォールバック・現在 null が既定） |
| `G._puctDet/_puctLook/_puctWidth` | puct 強さの個別上書き（UI トグルも内部でこれを設定） |
| `G._puctCap` | puct 探索量の上限 `{det,look,width}`（min適用。モバイル発熱対策＝web がモバイル時に {det:6,width:6} を設定。既定が浅いリーダーと enel(mcts) は不変） |
| `G._puctNoSkip` / `G._hybridNoSkip` / `G._noDonDiff` | 各フォールバック/項目の無効化（再測定用） |
| env `OPCG_AGENT=heur2` | A/B 用の実験改良版 heuristic（`isHeur2` 分岐） |
| env `OPCG_BASE=puct` | measure-matchup を「puct への上乗せ」直接ペア比較モードに |
| env `OPCG_DUMP` | per-seed 勝敗ダンプ → `tools/compare-dumps.js` で差分 |
| env `OPCG_THR` / `OPCG_H2` | 実験部品の単離 ON/OFF |
| env `OPCG_DECKS` / `OPCG_GAMES` / `OPCG_MCTS_GAMES` | selfplay-train の対戦限定・局数 |
| env `OPCG_MCTS_ROLLOUTS` / `OPCG_MCTS_DEPTH` | measure の mcts 計算量段 |
| env `OPCG_MODEL=mlp` / `OPCG_TARGET=value\|both` | 学習系の切替（selfplay/az 系） |
| env `AZ_POLICY_ONLY` / `AZ_VALUE_ONLY` | pytorch/train.py の学習対象限定 |

---

## 11. カード実装の系統バグの型（実装・レビュー時の自己チェックリスト）

過去の全弾照合で繰り返し出た誤りの型。新実装は必ずここを通す:

1. 「パワーN以下」＝**現在パワー**（`maxEffPower`）／「**元々の**パワー/コスト」＝ base（`maxPower`・`maxBaseCost`）。取り違え多発。
2. 「〜できる」「〜まで」＝ `optional:true`（候補があっても0個を選べる・辞退は【ターン1回】未消費）。付け漏れが最多。
3. **強制の「捨てる」は `discardOwn`**。`discardCost` は任意＝引き得バグになる（61箇所修正の前科）。
4. 「ドン‼-N」＝ `donMinus`（ドンデッキへ戻る・donTotal 減）。「ドン1枚をレスト（①）」だけ `{don:N}`（payDon）。イベントの `main.don` は読まれない＝コストは fx 先頭の `donMinus` で。
5. 「このキャラのコスト±N」＝ `staticCost`（盤面・除去耐性に効く）／手札のプレイコスト軽減だけ `costMod`。
6. 「〜を含む特徴」＝ `traitIncludes`（`trait` は完全一致）。**カード名**指定は `name`（特徴と取り違えの前科）。
7. 「リーダーかキャラ」対象は filter に `leader:true` を忘れない（14箇所修正の前科）。filter の or に `{type:'LEADER'}` があると特徴条件をリーダーが素通りする点にも注意。
8. パワー/コスト条件（maxPower 等）は **必ず `op.filter` の中**に置く（op トップレベルに置くと `opFilter` が無視して無制限になる）。
9. `noEffect`（効果なしカード）の判定は**本文 text 基準**（fx 基準はトリガー実装で回帰した前科）。
10. テキスト派生の無条件キーワード化に注意: 「コスト付き自己付与（…できる：このキャラは【KW】を得る）」は常時フラグにしない（fx の giveKeyword 存在で打ち消す）。
11. 空対象でフリーズさせない（`chooseCard`/`humanPick` は候補0で即 null 解決）。
12. **対象候補 0/1/複数の端点を必ず検討**: 候補1件かつ非optionalは自動選択される（chooseCard仕様）＝任意効果は候補1件でも `optional:true` で選択UIを出す（「モーダルが出ない」報告の典型原因）。
13. **条件不成立・コスト支払い不能は「発動」させない**: カットイン/確認UIを出さない・【ターン1回】未消費。「支払いだけ済んで効果不発」は禁止（手札不足・ドン不足・ライフ表裏不整合）。
14. **ライフ端点 0/1/2枚に公式裁定が集中**（ダブルアタックvsライフ1=Q&A36/400・ライフコストの表裏=Q&A1412/1413）。端点は必ずテスト化。
15. **バトルフロー上の反映位置を明示する**（§3.5の固定順のどこに効くか。対象変更等が宣言直後かカウンター後か）。
16. **人間/CPUの分岐は `isCPU` のみ・プロンプトに `side` 必須**（ロックステップ不変条件。ルート CLAUDE.md §3）。
17. **テストはフルフローで最低1本**（`declareAttack` 等の実フローを通す。データassertのみのテストは過去に全て素通しでバグを見逃した）＋実装後に `node tools/qa-lookup.js <番号>` で公式Q&Aを1件ずつ照合し、裁定が挙動に効くQ&Aをテストケース化。
18. **`op.then` は各opが自前実行する（runFxに汎用then実行は無い）**。thenを消費しないopに `then` を書くと「コストだけ支払って効果不発」になる（donMinus型で19枚が該当した実例。2026-07-19修正）。lint-fx の **E4 then-dropped** が機械検出する。新opでコスト型（`{op,..,then}`）を作るときは必ず成功パスで `if (op.then) await runFx(op.then, ctx)` を呼ぶ。
19. **フルフローテストは「痩せた盤面」で書く**: コスト支払いを含む効果は「素直な支払いソースが空の状態」を必ず1本（ドン全付与でコストエリア0＝紫カタクリL OP11-062の実バグ・手札0・ライフ0/1・デッキ残0）。理想盤面（リソース潤沢）のテストだけでは支払い系バグを全て素通しする。
20. **新op・コスト系opを作る/触るときはルールFAQも照合する**（`node tools/qa-lookup.js --rules`）。支払いソース等の裁定はカード個別Q&Aでなく**ルールFAQ側**にある（「ドン!!-N」は付与済みドンも戻せる＝returnDonChoose がコストエリアしか見ておらず不発だった実例）。カード実装＝カードQ&A、基盤実装＝ルールFAQ、と正本が違う。
21. **任意効果は辞退パスをテストで assert する**: 辞退→コスト未消費・【ターン1回】未消費（`ctx._declined`/`_committed`）を必ず1本。**「◯枚まで」は0枚の選択も合法**＝`optional:true` を付け、辞退UI（chooseCard の「選ばない（スキップ）」/ confirmUse の「発動しない」）が実際に出ることまで確認する（donMinus に確認が無く強制発動していた実例＝OP11-062/073）。
22. **効果解決の人間可視性**: 「この効果が発動したとき、プレイヤーは何を見るか？」に答えられない実装は不発と区別がつかない（peekOppDeck が flog のみで「機能していない」と報告された実例→reveal付きプロンプト化）。`flog` のみのopは smell。fxNote / floatOn / cardReveal / reveal付きshowPrompt のいずれかを必ず出す。「見る」系は完了ボタンを押すまで表示。

実装後は `node tools/lint-fx.js [セット]` を実行し **ERROR 0** を完了条件とする（存在しないop名/フック名=ERROR・optional/once/リーダー対象漏れ疑い=WARN→1件ずつトリアージ）。**発火の質の監査は `node tools/fx-fire-coverage.js --games 30 --json`**（CPU対戦でフック発火を att=試行/com=成立/dec=辞退シグナル/noop に分類し、**[A]「呼ばれるのに一度も成立しない」＝紫カタクリ型（fxは正しいのに支払い基盤/条件が不発）の候補を機械列挙**。成立判定は hashGameState 前後差分。新弾・大量実装後や「発動しない」報告時に回す。JSONは前回とのdiffで回帰検知にも使える。**tools/user-decks.json（D1マイデッキのスナップショット・更新コマンドはツール冒頭コメント）があればヒーロー固定回転で実使用カードにサンプル集中**＝非プリセットデッキの穴を塞ぐ。デバッグ用・ゲートではない）。パターン網羅チェックリストの全文は `.claude/skills/opcg-card-implement/SKILL.md`。

---

## 12. エンジン側の修正済み代表バグ（再発させない・回帰は tests/ にあり）

- 効果のドン付与はアクティブでなく**レストのドンから**（§4）。エネルのリーダー効果は3ステップを**常に実行**。
- **ステージ/イベントはアタック不可**: `canCardAttack` 冒頭で `type!=='LEADER'&&type!=='CHAR'` を弾く。
- アタック可否は先攻・後攻とも「自分の最初のターン不可」＝ `turnsTaken >= 2` が正（「先攻のみ」は公式ルールに反する誤修正の前科）。
- `donTotal` は `(x||0)` で NaN 堅牢化済み（undefined 混入で数値条件が誤通過していた）。
- CPU の起動メイン走査は `[...P.chars, ...(P.stage?[P.stage]:[])]`（ステージの起動メインを使わない前科）。
- `declareAttack` の早期 return パスでも操作権復帰（`G.busy=false; G.myActable=true`）を通す（人間のアタック中断で盤面が固まった前科）。
- **トリガーの空撃ち対策**（2026-07-23 実対戦報告・P-088ロー）: 「全てcond包み・全check不成立」のトリガー＝発動しても何も起こらずトラッシュへ行くだけ、を `triggerDead` が静的判定。**CPUは発動せず手札へ**（手札+1が厳密優位）。**人間には選択UIを出したまま**警告文＋既定ボタンを「手札に加える」に反転（トラッシュを意図的に増やす発動＝トラッシュ枚数参照デッキの正当なプレイがあり得るため選択肢は残す＝ユーザー指示）。例外: 場に `onTrigger` リスナー（OP05-109/OP13-106）が居る場合は発動宣言に実効果があるため dead 扱いしない。プロンプト文言も「不発なら手札に加わります」（虚偽）→「発動したカードは場に出ない限りトラッシュへ」に修正。回帰は unit-example 例3g（Q&A841境界・警告表示・意図的発動の許可を含む8assert）。
- 全記録は `docs/claude-md-archive-20260709.md`（旧 §9）参照。

---

## personal-agents ハブへの同期（2026-07-02 追加）

朝会（`~/Desktop/personal-agents` の /dashboard）は、このリポジトリの **git ログと未コミット変更を自動で読む**ため、作業は何もしなくても翌朝のダッシュボードに載る。それに加えて、**git に写らない変化**（実験方針の転換・大きな結果・ブロッカー）があったセッションの終わりには、`~/Desktop/personal-agents/dev/status.md` の「OPCG」セクションを1〜5行で更新すること（他アプリのセクションは触らない）。

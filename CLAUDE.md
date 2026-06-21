# CLAUDE.md

このリポジトリで Claude Code が作業するための指示書（プロジェクトメモリ）。
**作業前に必ず全文を読むこと。** 応答は日本語・簡潔に。

---

## 0. プロジェクト概要

ワンピースカードゲーム（OPCG / ワンピカード）の **対戦シミュレーター** を開発している。

- 本体: `index.html`（薄いエントリ）＋ `css/styles.css`（CSS）＋ `src/00..60-*.js`（バニラJSをクラシック`<script>`分割）。公式ルール準拠のゲームエンジン＋UI＋6デッキ（各50枚）。React/ESModules/ビルドは使わない（`file://`直接オープンで動かす）。
- 設計図: `docs/opcg-effect-system-design.md` … 効果を「タイミング/条件/コスト/アクション」に分解した統一設計。**カード効果を実装する前に必ず参照。**
- 別件（参考）: 「対策デッキ構築」スキル（`docs/SKILL.md`）と各デッキ攻略ガイド（`docs/*.md`）。デッキビルダーアプリ構想もあるが、本リポジトリの主対象はシミュレーター。

> リポジトリ構成（推奨。手元の配置に合わせて読み替え可）
> ```
> index.html        # 薄いエントリ（49行）。<link css/styles.css> と <script src> 群を読み込むだけ。HTMLマークアップは #topbar/#screen/#preview のみ
> css/styles.css    # 全CSS（旧 index.html の <style> を分離・約2650行）
> src/              # ★本体JS。クラシック<script>を「番号順」に読み込み（全関数がグローバル共有）。ES Modules不可（file://でCORS）
>   00-data.js        # 定数(IMG/COLOR_HEX)・C・def()・全def({...})メタ定義・DECKS・mergeCardDB() IIFE（★効果fxは持たず cards-fx.js に一元化）
>   10-engine-core.js # G・inst/buildPlayer/startGame・マリガン・ドン状態・checkCond/power/フィルタ
>   20-targeting-fx.js# chooseCard/humanPick/cpuPick・runFx・doOp（効果実行エンジンの巨大switch）
>   30-flow-battle.js # summon/除去・ターン進行・バトル解決(declareAttack等)・リーダー固有ロジック
>   40-ui-render.js   # img系・log/toast/アニメ・render とHTMLビルダ群
>   50-input-cpu-ai.js# プロンプト/入力ハンドラ・CPUヒューリスティック・AI連携(callClaude)
>   60-screens-init.js# デッキ選択・モーダル/RULES_HTML・デッキビルダー・onHover/init/DOMContentLoaded登録
>   70-ai.js          # ★強いCPU基盤＋L2決定化MCTS＋L3学習eval。clone/load/determinize/mctsTurn/evalFeatures/evalWinProb・AGENTS.mcts。詳細 docs/ai-design.md
>   ai-weights.js     # ★L3: 自己対戦で学習した盤面評価の重み(window.AI_WEIGHTS)。tools/selfplay-train.js が自動生成（手編集禁止・nullなら手作りevalにフォールバック）
> cards.js          # window.CARD_DB（全カードデータ 3000枚超。dataOnly）。tools/scrape-cards.js で公式から生成
> cards-fx.js       # window.CARD_FX（★全カードの効果fxを一元化。番号→fx の対応表。264枚）
> CLAUDE.md                   # この指示書
> docs/
>   opcg-effect-system-design.md   # 効果の統一設計（最重要リファレンス）。★§12に最新の全op/フィルタ/条件/タイミング一覧
>   ai-design.md                   # ★強いCPU(AI)の設計と進め方（不完全情報=ポーカー型/決定化MCTS/評価関数学習）。AI作業前に参照
>   ワンピースカードゲーム完全ガイド….md  # ルール/環境/戦略
>   SKILL.md, *_guide.md           # デッキ構築スキル・攻略ガイド
> tools/
>   scrape-cards.js  # 公式カードリストから cards.js を再生成
>   selfplay-train.js # ★L3学習: 自己対戦→盤面評価をロジ回帰で学習→src/ai-weights.js 生成。OPCG_DECKS='teach,enel'で対戦を限定（特化学習）/OPCG_GAMES/OPCG_MCTS_GAMES
>   measure-matchup.js # ★マッチアップ精密測定: 同一seedのペア比較でAGENT(mcts/vlook/heur2)の実効果を大Nで測る（改善/退行flip＋符号検定）。N=30のノイズで判定不能を解消
>   analyze-heuristic.js # ★負け局の自動分析: heuristic自己対戦を回し勝側vs負側で各指標(手札残/未使用ドン/盤面/攻撃/打ち損ね)を比較し弱点候補を出す（改良仮説の種）
> tests/
>   test.js          # 全自動検証（これを最初に回す。8ステップ）
>   _load-app.js     # ★本体JS読み込み共有ヘルパー。index.html記載の<script src="src/...">順でsrc/*.jsを連結。全ハーネスが使用
>   stubs.js         # ヘッドレス用DOM/タイマースタブ
>   cpu-vs-cpu.js    # CPU対CPU 30戦ハーネス
>   human-fuzz.js    # 人間オートパイロット 30戦（フリーズ検出）
>   unit-example.js  # カード効果ユニットテストの雛形
>   fx-cards.js      # cards-fx.js の効果が実機で発動するか検証（Phase3。新実装はここに足す）
>   custom-decks.js  # 新効果カード中心のカスタムデッキでCPU対戦30戦（フリーズ/二重アタック検出＋新カード稼働の証跡）
>   deck-builder.js  # デッキビルダーの検証(50枚/色/枚数制限)＋JSON入出力の往復
>   arena.js         # ★エージェント対戦アリーナ（node単体実行）。2エージェントをN戦・席入替・seed固定で勝率/Elo測定（強さの正＝測定土台）
>   ai-core.js       # ★強いCPU(AI)基盤の回帰: RNG再現/clone往復/特徴量・学習重み整合/MCTS完走（L1/L2/L3）
> ```
> `node tests/test.js` は9ステップ（構文／デッキ整合／CPU対CPU30戦／人間オートパイロット30戦／ユニット／Phase3効果／カスタムデッキCPU30戦／デッキビルダー検証／AI基盤）。
> AI学習: `node tools/selfplay-train.js`（自己対戦→評価関数を学習→`src/ai-weights.js`生成）。`node tests/arena.js`の「L2 MCTS」節で heuristic比の実効果を測定。
>
> **★重要（ファイル依存）**: `index.html` は単体では動かない。`cards.js`・`cards-fx.js`・`css/styles.css`・`src/*.js` 一式が**同じ階層構造**で揃っている必要がある（ブラウザ・テストとも）。テストは `tests/_load-app.js` が index.html の `<script src="src/...">` 順に `src/*.js` を連結し、cards.js/cards-fx.js を前置して実行する。
>
> **★分割時の鉄則**: src/*.js はクラシック`<script>`連結（=1つのグローバルスコープ）。①同名の `const`/`let` を2ファイルに置くと連結時 SyntaxError。②ロード時に即実行される文（`mergeCardDB()` IIFE・`def()`群・`DOMContentLoaded`登録）は依存順を厳守（`def`定義・`def()`群・`mergeCardDB`は必ず `00-data.js` に同居）。関数定義（function/constアロー）は呼出時に全ファイルロード済みなので前方参照OK。新規コードは役割に合うsrcファイルに足す。

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

> 依存は **Node.js のみ**（ビルド不要）。シミュレーターはブラウザでファイルを開けば動く。

```bash
# 全自動検証（構文 → デッキ整合 → CPU対CPU30戦 → 人間オートパイロット30戦）
node tests/test.js

# カード効果のユニットテスト（雛形。新効果はここに足す）
node tests/unit-example.js

# 構文だけ素早く見たいとき（<script>を取り出して --check）
node -e 'const fs=require("fs");fs.writeFileSync("/tmp/app.js",fs.readFileSync("index.html","utf8").match(/<script>([\s\S]*?)<\/script>/)[1]);' && node --check /tmp/app.js
```

ブラウザ動作確認: `index.html` をそのまま開く（カード画像は公式サイトからホットリンク。CSP/プレビュー環境では画像が出ないことがあるが、DOM/演出は動く＝既知の制約）。

---

## 3. アーキテクチャ（シミュレーター本体）

本体JSは **`src/00..60-*.js` の複数クラシック`<script>`** に分割（CSSは `css/styles.css`、`index.html` は薄いエントリ）。全ファイルが1つのグローバルスコープを共有するので、関数/変数は従来どおり相互参照できる。テストは `tests/_load-app.js` が `src/*.js` を index.html 記載順に連結して Node で実行する。

### 3.1 グローバル状態 `G`
対戦の全状態。主なフィールド:
- `G.active`（'me'|'cpu'）, `G.busy`, `G.myActable`, `G.winner`, `G.turnSeq`, `G.turnDisp`, `G.firstPlayer`
- `G.players[side]` = `{ isCPU, leader, chars[], hand[], life[], deck[], trash[], stage, don:{active,rested}, donMax, turnsTaken, denyBlock, ... }`
- 各カード = `{ no, base(=C[no]), owner, uid, attachedDon, rested, buffs[], kwGrant[], frozen, negSeq, noAtkSeq, ... }`
- ライフカードは `_faceUp`（表向きフラグ）を持つことがある。
- 演出用の一時状態: `G._atkFrom` / `G._atkTo`（攻撃可視化のハイライト対象 uid）。

### 3.2 カード定義 `C` と `def()`
- `function def(c){ C[c.no]=c; return c; }` で全カードを `C` に登録。
- カードは `{ no, name, color[], type:'LEADER'|'CHAR'|'EVENT'|'STAGE', cost, power, counter, traits[], leader, donDeck, ...kw..., fx, text }`。
- `text` は日本語の効果説明（必ず公式テキストと一致させる）。

### 3.3 効果スキーマ `fx`（タイミング別）
カードの `fx` に、発動タイミングごとの op 配列を持つ:
- `fx.onPlay` … 【登場時】（`summon()` で解決）
- `fx.onAttack` … 【アタック時】（`declareAttack()` で解決）
- `fx.onKO` … 【KO時】（`koCard()` で解決）
- `fx.trigger` … 【トリガー】（`dealLeaderDamage()`→`askTrigger()` で解決）
- `fx.static` … 永続/常在（`power()` や各種判定で都度評価。条件 `oppTurn`/`selfTurn` など）
- `fx.act` … 【起動メイン】= `{ label, cost:{...}, fx:[...] }`（`activateAbility()`／リーダーは `leaderActivate()`）

→ **最新の全タイミング/コスト/アクション/フィルタ/条件の一覧は `docs/opcg-effect-system-design.md` の §12（実装準拠・約85op）を必ず参照。** §3〜§6は初期設計の分類。
→ **全カードの効果は `cards-fx.js`（番号→fx）に一元化済み**。`index.html` の `def()` は初期6デッキの**メタ情報のみ**（コスト/パワー/特徴/リーダーキー/キーワード/condRush/condBlocker/costMod 等）で、fxは持たない。新効果も必ず `cards-fx.js` に追加し、`tests/fx-cards.js` に検証ケースを足す（`mergeCardDB()` が起動時に def済み/データのみ問わず C へ CARD_FX を付与・dataOnly解除）。fxは「プレーンなopオブジェクト」で書く（ヘルパー関数は使わない）。

### 3.4 効果の実行エンジン `doOp(op, ctx)`
- すべてのアクションは `op` オブジェクトで表現し、`doOp` の巨大 switch が実行。`runFx(ops, ctx)` が配列を順に解決（各 op は try/catch で囲まれ、例外は握りつぶしてログ）。
- 主な op（カテゴリ別。**完全な最新表は設計図 §12**）:
  - コスト系(`{op,..,then}`): `revealCost`(手札公開) / `discardCost`(捨てる) / `restDonCost`(ドンレスト) / `trashOwnCharCost` / `trashSelfCost` / `bounceOwnCharCost` / `restOwnAsCost`
  - 除去: `ko` / `koZero` / `restChar` / `bounce` / `deckBottom` / `handToBottom`
  - ロック/妨害: `lock` / `restImmune`(レストにできない＝攻撃/ブロック不可) / `setAttackBan` / `denyBlocker` / `negateChoose`
  - コスト操作: `staticCost`(常在=盤面のキャラ自身のコスト±N・除去耐性) / `addCostBuff`(一時) ／ ※`costMod`は手札のプレイコスト。**取り違え厳禁**
  - パワー: `powerMod` / `setPowerOppTurn` / `powerCopy` / `condBuff` / `leaderBuff` / `counterBuff`
  - リソース: `draw` / `search` / `scry` / `bottomOwn` / `selfToHand` / `reviveFromTrash`
  - 展開: `playCharFromHand` / `playSpecificFromHand` / `playSelf` / `playEventFromHand`
  - ドン: `donAttach` / `donAttachAll`（**レストのドンから付与**）/ `donMinus`（ドンデッキへ戻す）
  - ライフ: `lifeAddFromDeck`（`faceUp`可）/ `lifeAddChoose` / `flipLifeUp` / `lifeToHand` / `handToLife` / `lifeTrash` / `lifeSwap` / `trashToLife` / `oppLifeToHand` / `oppDamage`
  - 状態: `negateEffect` / `effectImmune` / `giveKeyword` / `grantUnblockable` / `lock` / `leaveProtect` / `denyBlockerVsLeader` / `unblockableAttack`
  - 制御: `cond`（条件分岐）

### 3.5 描画とフック
- `render()` が `#screen.innerHTML` を毎回作り直す（盤面全体を再構築）。`document.body` 直付けの要素（勝敗画面・攻撃アナウンス）は再描画で消えないので、そこに置く。
- バトルのフック順序（`declareAttack` で固定。崩さない）:
  `アタック宣言 →【アタック時】→ 対象変更(黒ひげ) → ブロック → カウンター → パワー比較 → ダメージ(ライフ/トリガー or KO/【KO時】)`

---

## 4. ★ドンの状態モデル（バグ多発ポイント・最重要）

公式ルールに基づき、以下を**厳密に**守る。ここを取り違えると必ずバグる。

| 操作 | 取る場所 | 実装 |
|---|---|---|
| プレイヤーの手動付与（自分のメインで重ねる） | コストエリアの **アクティブ** | `attachDonFlow`（`P.don.active` から） |
| 効果「**レストのドン!!を付与**」（少女・お玉・ヤマト・エネル等） | コストエリアの **レスト** | `donAttach`/`donAttachAll`（`P.don.rested` から。レスト0なら付与0） |
| ドン!!-N | アクティブ/レスト/付与のどこからでも → **ドンデッキへ戻す** | `donMinus`→`returnDonChoose`（`donTotal` が減る） |
| リフレッシュ | 付与ドンとレストを **すべてアクティブ** でコストエリアへ | `beginTurn()` の冒頭 |

- `donTotal(side) = active + rested + Σ attachedDon`。「ドンデッキ残 = `donMax` − `donTotal`」。
- エネル（`donDeck:6`）は、ドン-1イベント（放電・雷獣等）でドンがドンデッキに戻り、毎ターン引き直す**循環**で成立する。リーダー効果は「1枚アクティブ＋最大4枚レスト追加 → レストのドン最大4付与」を**常に実行**（満杯でも既存レストを付与）。
- 新しい付与系の効果を足すときは、テキストが「レストのドン」なら必ず `donAttach`（レスト）を使う。**アクティブから付与する効果は手動付与だけ。**

---

## 5. テストの仕組みと注意点

- `node tests/test.js` が全体検証。内部で `<script>` を抽出し、`tests/stubs.js` を前置して各ハーネスを Node 実行する。
- **タイマーは setImmediate ベース**（`tests/stubs.js`）。`setTimeout(0)` のままだと、テストの密ループがゲームの連続 `sleep` を飢餓させ「停止」を**誤検知**する（過去にこれで beginTurn が止まって見えた＝ハーネス起因。実ブラウザでは起きない）。新しいテストもこのスタブを使う。
- 合格条件:
  - CPU対CPU: `noWinner=0 doubleAttacks=0`（勝者が出る・同一ターンに同じカードが二度アタックしない）
  - 人間オートパイロット: `真の停止: 0`（busyのまま状態不変＝フリーズ無し）かつ `クリック不能プロンプト: なし`
- ユニットテストの型は `tests/unit-example.js`。最小の `setupG()` でプレイヤーを組み、`doOp(...)`/`leaderActivate(...)` を呼んで状態を assert する。**効果を追加・修正したら必ず1ケース足す。**

---

## 6. 新しいカード効果を実装する手順

1. **公式カードリストで効果テキストを確認**（カードNo./コスト/パワー/カウンター/色/特徴/効果全文/レアリティ）。`text` に正確に転記。
2. 設計図 §1 の4要素に分解（タイミング/条件/コスト/アクション）。
3. 既存 op で表現できるか確認（§3.4 / 設計図 §6）。足りなければ `doOp` に op を追加（命名は既存に倣う）。
4. **コスト/任意の扱い**: 「できる」=任意（`optional:true`）、「する」=強制。「〜まで」=0個可。空対象でフリーズしないこと（`chooseCard` は候補0で `null`、`humanPick` も候補0で即 `null`）。
5. **期限**を持たせる（このバトル中/このターン中/次の相手エンドフェイズ終了時まで）。失効漏れに注意。
6. `tests/unit-example.js` にテストを追加 → `node tests/unit-example.js` と `node tests/test.js` が緑になるまで直す。

---

## 7. コーディング規約・落とし穴

- **CSSは `css/styles.css`・本体JSは `src/*.js`（クラシック`<script>`連結）** の分離構成を維持。ES Modules化しない（`file://`直接オープンで動かす制約）。外部JSはCDN（`cdnjs.cloudflare.com`）のみ。新規コードは役割に合う `src/*.js` に足す（同名const重複・即実行文の順序に注意。§0「分割時の鉄則」参照）。
- **localStorage/sessionStorage を使わない**（この実行環境では不可）。状態は `G` に持つ。
- カード画像は `IMG(no)`（weserv 経由で公式画像をホットリンク、`referrerpolicy=no-referrer` ＋ `onerror` フォールバック）。プレビュー環境で画像が出ないのは既知。
- 文字列を innerHTML に差し込むときは `escapeHTML()` を通す（特に `name`）。
- `render()` 後に DOM へ付けた一時要素は消えるので、残したいものは `document.body` 直付け（勝敗画面・攻撃アナウンスがその方式）。
- バトルのフック順序（§3.5）を崩さない。
- 大きな変更後は必ず `node tests/test.js`。

---

## 8. 既知のギャップ / ロードマップ（設計図 §10 と対応）

- ✅ **強いCPU（AI）**: L1基盤（シード可能`rng()`/`cloneGameState`/`loadGameState`/seam`AGENTS`/アリーナ`tests/arena.js`）＋ **L2 決定化MCTS**（`src/70-ai.js`・`AGENTS.mcts`）＋ **L3 評価関数の自己対戦学習（🧪experimental・既定off）**（`tools/selfplay-train.js`→`src/ai-weights.js`・`evalFeatures`(17特徴・相手リーダーone-hot)/`evalWinProb`(リーダー別)）を実装。**★非決定性バグ修正後の決定的測定での正直な結論**: **確実に強いのは「よく調整された heuristic」**。L2決定化MCTSの対heuristicは**小さく不安定**（決定的測定で enelミラー+7.5/teachミラー-2.5/teach対enel±0pt＝heuristicが既に強くMCTSはめったに別手を選ばない）。L3学習evalは**手作りと差なし(±0〜2.5pt・測定限界以下)**→`AI_WEIGHTS=null`で手作りeval既定。**以前の「+6.7〜10pt」は下記の非決定性バグによる測定の幻だった**。設計と知見は `docs/ai-design.md`。**★ハマった罠（再発防止）**: per-action探索はmaskingで効かない／**先読み後の状態復元は`loadGameState(複製)`でなく“元オブジェクト参照”を戻す**（識別子差し替えで実プレイが劣化）／rng隔離(`rngState`)／ロールアウトは`_noChain`完全await（残留async防止）／seed帯の席バイアスは同一seedの h-vs-h基準を引いて評価／**特徴量を安易に増やすと逆効果**（17→23で検証精度同等でもarenaは lucy +10pt→0pt に悪化。線形evalがheuristic分布に過適合＋相手手札ベース特徴は決定化でノイズ注入→17に差し戻し済。**「検証精度≠強さ・アリーナが正」**、特徴はarena確認後に1つずつ）。**★★最重要バグ＝MCTSが非決定的だった**：同一プロセスで複数局を連続実行すると前局の投げっぱなし`beginTurn`連鎖の保留タスクが次局に持ち越し汚染（同一seedでも勝敗が変わる・自己対戦学習データも水増し汚染）→ **今までの測定値(+10pt等)が全て信用できなかった真因**。**解決＝各局終了後にイベントループをドレイン**（`for(k<40)await setImmediate`）。`tools/measure-matchup.js`/`selfplay-train.js`/`tests/arena.js`に導入済。**複数局を回す新ハーネスは必ずドレインを入れる**。対戦相手としては無害（毎回違う手＝良相手）、問題は測定/学習の再現性だけ。改善判定は **`tools/measure-matchup.js` の同一seedペア比較＋符号検定**で（N=30はノイズ±9%で判定不能）。MCTSは1手数秒なので対人UIでは任意有効化（`G.players.cpu.agent='mcts'`）。**heuristic改良の測定駆動ループ**: `AGENTS.heur2`（=heuristic＋`isHeur2(side)`分岐で実験改良）を `OPCG_AGENT=heur2 node tools/measure-matchup.js` でA/B（改善/退行flip＋符号検定）→有意に勝つ時だけ既定化。**★採用済の改良**: エネルのリーダー「レストのドン付与」先を**アタックできる役へ**修正（旧:最大パワーをアタック可否無視で選び当ターン死に）＝**全6対面+~6pt・合算p<0.0001で有意**（`src/30-flow-battle.js` leaderActivate enel・回帰テストは`tests/ai-core.js`）。**仮説源はユーザーのプレイ観察**が最良（自動分析`tools/analyze-heuristic.js`は補助）。却下例: aggression(0flip)/KO価値(7が最適)/mulligan(発火せず)。詳細 docs/ai-design.md §7.1。policy学習(vlook=価値貪欲)/value学習も heuristic 未満（価値貪欲は価値誤差を突いて自滅）。本当に超えるのは AlphaZero規模(Python/GPU)。**★AlphaZero型の足場をJSで全段実装・測定済（docs/ai-design.md §8）**: **Stage A** 価値NN(MLP・`mlpForward`/`trainMLP`・`OPCG_MODEL=mlp`)＝検証精度は上がる(enel0.66→0.81)が**MCTS着手は±0.0pt不変・vlookは-58pt崩壊**／**Stage B** per-action方策NN(アタックprior・`polFeatures`/`policyPickAttack`/`AGENTS.npolicy`/`tools/train-policy.js`→`src/ai-policy.js`)＝heuristicを高精度蒸留(top1 0.79〜0.92)し**npolicy≈heuristic(+1.7〜3.3pt非有意)**／**Stage C** 自己対戦反復DAgger(`improvedAttack`=1-ply価値先読み教師・`AGENTS.npimprove`/`tools/selfplay-iterate.js`)＝**有意に退行(teach -25pt p=0.021)**＝価値が「greedy改善の教師」になるほど頑健でない(vlook崩壊と同根)。**結論: 全段ともheuristic未満＝JSの天井を実機で確定**。`src/ai-policy.js`は退行する世代でなく**Stage B中立方策を出荷**、npolicy/npimproveはopt-in実験（既定CPUはheuristic）。足場(前向きモデル/seam/価値NN/方策NN/反復ループ/測定器/回帰)は完成しPython移植可。


- ✅(部分): コストの統一 → `revealCost`/`discardCost`/`restDonCost`/`trashOwnCharCost`/`trashSelfCost`/`bounceOwnCharCost`/`restOwnAsCost` の `{op,..,then}` 形で統一済。完全な単一`payCost()`化は将来課題。
- ✅: タイミングフック → `onOppAttack`/`onTurnEnd`/`onAllyLeave`/`onReviveFromTrash`/**`onBlock`（【ブロック時】）**/**`onAllyEnter`（リーダーの【キャラ登場時】）** を追加済。`onAllyEnter`は`summon`内の`checkAllyEnter`で誘発（`when:'selfTurn'|'oppTurn'`/`filter`/`cond`/`once`対応）。**ナミOP11-041・ハンコックOP14-041の登場時ロジックをハードコードからデータ駆動fxへ移行済**（`namiOnEnter`関数は削除）。リーダー固有ロジックの残りハードコード（lucy/aceの被ダメ時カウンター反応・enelの起動メイン・teachのコスト+1静的）は今後同様にfxフック化していく。**同名・別Noの未実装リーダーを番号キーfxで実装開始**（curatedの短縮キーと独立＝名前衝突しない）: OP15-098ルフィ(空島=leaveProtect静的)/ST29-001ルフィ(リーダーのonAttack)/OP16-022ルフィ(fx.act donActivate＋allSelfChar)/OP16-001エース(fx.act giveKeyword・orフィルタ)。**リーダーも`fx.act`で起動メイン可**（人間=openOwnMenu、CPU=act loopに`P.leader`追加済）。**複合リーダー5枚も新フックで実装完了**: OP03-040/P-117ナミ(static `deckOutWin`=デッキ0でlose(opp)＝勝利／`onLeaderHitLife`=このリーダーのアタックでライフダメージ時に`deckTrashCost`で自爆ミル)・OP07-038ハンコック(`onAllyLeave`に`cause:'ownEffect'`＋`when`追加。自己除去コストop群がcause付きでcheckAllyLeave発火)・OP05-098エネル(`onLifeZero`=dealLeaderDamageでライフ0時に補充＋捨て)・OP11-040ルフィ(`onTurnStart`=beginTurnのメイン直前。search簡略=残りはデッキ下)・OP13-001ルフィ(リーダーの`onOppAttack`＝declareAttackのループに`P.leader`追加＋新op`restDonForBuff`)。新condは`activeDonAtMost`/`activeDonAtLeast`。**リーダーの`onAttack`/`onOppAttack`もキャラ同様に誘発する**（declareAttackがattacker/防御側leaderを走査）。onBlockは`declareAttack`のブロック宣言後・カウンター前に誘発（`{self:blocker,side:dSide,attacker}`）。**【ブロック時】カード18枚すべて実装済**（モネOP05-036(+_r1)/ヘルメッポOP12-033/ヒナOP02-110/戦桃丸EB04-053/ベラミーOP10-077/ジンベエOP01-014/キラーOP01-039(+_r1)/ハンコックOP01-078(+_r1・onAttack兼)/ウタST05-004(+_r1)/ブラックマリアOP01-111/ホーキンスOP05-047/シュライヤOP06-009/しのぶST09-007/クロコダイルST03-003）。複合条件は`{and:[...]}`＋既存obj cond(`selfCharCount`/`selfHandAtMost`)。実装中に追加したprimitive: **`powerMod target:'self'`**（このキャラ自身にaddBuff）、**`lifeCost pos:'choose'`**（ライフ上/下を選んで手札）、**onAttack/onBlockの`once:'turn'`ゲート**（共有フラグ`_onceAtkBlkTurn`で【ターン1回】＝両タイミング横断）。クロコダイルST03-003は公式文「コスト2以下のキャラ」が相手/自分の明記なし→相手除去用途で`deckBottom`(相手専用)実装（自キャラ送りは利得無し）。
- 中: 期限(`duration`)の一元管理。パワー/無効/凍結の失効漏れ防止（`turnEnd`/`battle`/`ownerNextStart`/`oppNextEnd`タグで運用中）。
- ✅: `donFromDeck` / `donActivate` op 追加済（海軍ランプ・エネル系）。
- 低: カードデータを設計図 §9 の統一スキーマへ段階移行（新カードがデータ追加だけで済む状態を目指す）。
- 環境: 2026/4 のブロックアイコン①ローテーション（OP01–04 がスタン落ち）。デッキ合法性の見直し。
- **進行中の方針**: 全カード効果を `cards-fx.js` に一元化済（264枚）。**OP-16(31件)・OP-15(37件)を公式カードリストと全枚数照合して修正済**（`tools/official-op16.js`/`official-op15.js`が正本）。次は他弾（OP-14以前・EB・ST）を同じ公式照合フロー（公式取得→照合→敵対的検証→回帰追加）で精査する。
- 未完: ティーチ残りカード（ドクQ・シリュウのパワー値・OP09-093・ハチノス）の1枚ずつの公式再照合。

---

## 9. 直近で修正済みの代表バグ（再発させない）

- 効果のドン付与がアクティブから出ていた → `donAttach`/`donAttachAll` を **レストのドン** から取得に修正（§4）。
- エネルのリーダー効果が発動しない時があった → 3ステップ（1アクティブ＋4レスト追加→レスト付与）を**常に実行**に修正（§4）。
- 入力プロンプトでフリーズ → `humanPick`/サーチop/カウンターを堅牢化（空候補→null、想定外値でも必ず解決、支払えないカウンターは選択不可）。
- 「このキャラのコスト+N」を `costMod`（手札のプレイコスト）で実装していた（OP16-082錦えもん）→ **`staticCost`（盤面のキャラ自身のコスト＝除去耐性）** に修正。「このキャラのコスト±N」は必ず`staticCost`、手札のプレイコスト軽減だけ`costMod`。
- デッキビルダーで「何枚でも入れられる」カード(OP16-042)が `builderAdd` では4枚超追加できるのに `builderValidate`（保存/インポート）で弾かれていた → 検証側にも枚数制限の例外を追加（整合）。
- **ステージカードがアタックできた** → `canCardAttack` が登場ターン制限を `type==='CHAR'` でしか見ておらず STAGE/EVENT が素通りで `true` を返していた。冒頭に `if (type!=='LEADER' && type!=='CHAR') return false;`（アタック可能はリーダー/キャラのみ）を追加。回帰は `tests/fx-cards.js`（ステージ/イベント=false・通常キャラ=true）。
- `donTotal` が `P.don.rested` 等 undefined のとき NaN を返し、`donAtLeast`/`selfCostAtLeast` 等の数値比較が誤通過し得た → `(x||0)` で堅牢化。
- **「ドン‼-N」コストを `{don:N}`(=`payDon`=アクティブをレストにするだけ・donTotal不変)で実装していた**（紫エネルのOP15-060/118/074/075/076/077/078, OP16-078マリンフォード）→ 公式の「ドン‼-N」は**ドンデッキへ戻す**(`donMinus`/`returnDonChoose`・donTotalが減る)。fx先頭に `DONMINUS(n)`/`{op:'donMinus',n}` を置き、`cost`から`don`を除去。**「ドン‼-N」は必ず`donMinus`、「自分のドン1枚をレスト(①)」だけ`{don:N}`(payDon)。** さらに**イベントの`main.don`は`tryPlayHand`/CPUイベントループで一切読まれず無視**されていた（＝ドン-Nがタダで踏み倒されていた）ので、イベントも`main.fx`先頭の`donMinus`へ移行。
- **CPUがステージの起動メインを使わなかった**（act使用ループが`P.chars`のみで`P.stage`未走査）→ ハチノス(OP09-099)/マリンフォード等を使えるよう `[...P.chars, ...(P.stage?[P.stage]:[])]` に拡張。
- **CPUのエネルのリーダー効果が発動しない時があった**（条件が `don.active>=1 && chars.length>0` と厳しく、盤面が空だとランプ丸ごとスキップ）→ `turnsTaken>=2 && _enelUsedTurn!==turnSeq` に緩和（ドンランプはほぼ常に得なので毎ターン使う）。
- **★OP-16全105枚を公式カードリストと1枚ずつ照合し31件のバグを修正**（2026-06。`tools/official-op16.js` が公式効果文の正本）。代表的な誤りの型:
  - **「パワーN以下」(現在パワー) と「元々のパワーN以下」(基本パワー) の取り違え**。`maxPower`はbase(元々の)を見る。公式に「元々の」が無い「パワーN以下」は新設の **`maxEffPower`(現在パワー=`power()`)** を使う。OP16-006/008等を修正。逆の `minEffPower`/`minPower` も同様。
  - **「〜まで」「〜できる」=任意(`optional:true`)の付け漏れ**が多発（候補があっても0個を選べる）。KO/レスト/powerMod/登場系に系統的に欠落していた。
  - **カード名と特徴の取り違え**（「インペルダウンの囚人」はカード名でOP16-031が`trait`指定で死んでいた→`name`/`playSpecificFromHand`）。
  - **「を含む特徴」は `traitIncludes`**（`trait`は完全一致）。OP16-001/005等。
  - **コピペ由来の架空効果**（OP16-045/043の余計な`then`、OP16-104/109/110の余計な`trigger`）と **効果欠落**（OP16-057/101/102の【トリガー】未実装）。
  - 新規op/条件: `maxEffPower`/`minEffPower`(フィルタ・現在パワー基準), `oppChar`(条件・相手の場のキャラ), `trashToLife` の `faceUp`, `oppLifeToHand` の `optional`。
  - 検証手順: 公式リスト(WebFetchで範囲指定すると全文取得可)→`tools/official-opNN.js`に転記→マルチエージェントで照合→敵対的再検証→`tests/fx-cards.js`に回帰追加。**効果の正しさはこの「公式テキストとの意味照合」でしか担保できない**（構造チェック=例外/フリーズ検出だけでは効果の誤りは見つからない）。
- **★OP-15全110枚を公式照合し37件修正**（`tools/official-op15.js`が正本）。OP-16と同型の誤り(optional欠落/maxPower⇄maxEffPower/【トリガー】未実装・余計な付与)に加え、OP-15特有:
  - **フィルタのパワー/コスト指定がopのトップレベルにあると`opFilter`が無視する**（`op.filter`があるとそれ"だけ"返す仕様）。`maxPower`等は必ず**filter内**に置く。OP15-018はトップレベル`maxPower`が読まれず無制限KOになっていた。
  - **「元々のコストN以下」用の `maxBaseCost`/`minBaseCost` フィルタ**を新設（`maxCost`はeffコスト＝常在/一時増減込み。OP15-032/097/014）。
  - **`donAttach` の `fromAny`**（「コストエリアのドン付与」=アクティブからも付与。レストのみの通常付与と別。OP15-023）。`oppDonAttach`の`fromAny`も同様（OP15-028）。
  - **イベントのプレイコストが `b.cost` 直参照で `costMod` を無視**していた → `effCost()` 経由に統一（handPlayable/tryPlayHand/CPUイベント）。OP15-021(トラッシュにイベ4枚でコスト-3)。
  - **ステージの【相手のアタック時】(onOppAttack)が誘発しない**（declareAttackが防御側`chars`しか回さない）→ `P.stage`も誘発対象に追加（OP15-057ドレスローザ王国）。`bounceStage` op も新設(OP15-054)。
  - **ルーシーのリーダー効果**: カウンターの「任意の枚数捨て1枚ごと+1000」が1枚固定だった→`lucyCounter`をループ化(CPUは上限2)。【起動メイン】「当ターン元々コスト3+イベント発動済なら1ドロー」が未実装→`leaderActivate`に`lucy`分岐＋`_lucyEventTurn`フラグを追加。
  - 二択効果は `chooseOption`(既存op)。`oppChar`条件も活用。
- アタック不可は **先攻・後攻とも「自分の最初のターン(turnsTaken=1)」**。`canAttackThisTurn = turnsTaken >= 2` が正（後攻も1ターン目はアタック不可）。※一度「先攻のみ」と誤修正したが公式ルールに反するため差し戻した。
- **★人間のアタックが中断されると盤面が固まりアタック不能になった** → `declareAttack` は冒頭で `G.busy=true` にするが、「防御側の【相手のアタック時】等でアタッカーが場を離れた/アタック不可になった」中断の早期returnパスだけ末尾の操作権復帰（人間: `G.busy=false; G.myActable=true`）を通らず、`G.busy=true` のまま固まっていた。アクティブなカードも `myAct` 判定で全てクリック不能になり「アタックボタンが出ない」。早期returnにも復帰処理を追加。回帰は `tests/fx-cards.js`。

> いずれも `tests/` のハーネス＋ユニットテストで再発検出できる。変更時は必ず回すこと。

> ★スモークテストの注意: `await sleep()` を含む処理（koCard/summon等）を `Promise.race([p, setTimeout(HANG)])` で囲うと、stubs.js の `setTimeout=setImmediate` 化により race 側タイマーが先に発火し**フリーズを誤検知**する（§5）。実機ハング判定は**本物の setTimeout を退避して**使うこと。

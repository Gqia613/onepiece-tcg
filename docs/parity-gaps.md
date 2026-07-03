# React移植 パリティギャップ（元バニラ版 vs React版）

調査対象: 元 `src/40-ui-render.js` / `src/50-input-cpu-ai.js` / `src/60-screens-init.js` と
React `web/src/**`（実コードを読んで照合）。優先度は「対戦の遊びやすさへの影響」で判定。

凡例: 影響=高/中/低、状態=無い/部分的。確証のない箇所は『要確認』を明記。

---

## 1. 未移植・欠落機能の一覧（優先度つき）

### 優先度【高】（遊びやすさ・モバイル操作に直結）

| # | 機能名 | 元の実装(ファイル:行) | React版の状態 | 影響 | 対応案(1行) |
|---|--------|----------------------|---------------|------|-------------|
| H1 | **サイドパネル（情報パネル）本体**（CPU予測/ログの2タブ＋開閉トグル） | `sidePanelHTML()` 40-ui-render.js:390-409 / `toggleSide` `closeSidePanel` `setTab` 50-input-cpu-ai.js:134-135,116-125 / トグルボタン `#sideToggle` index.html:29 | **無い**（パネル自体が存在しない。後述 H2/H3/H4 の器） | 高 | 右ドロワーComponent（タブ=予測/ログ）を新設し App のトグルから開閉 |
| H2 | **でんでん虫CPU予測パネル**（次手番予測・確度表示・「CPUの手を読む」ボタン） | `predictCPU()` 50-input-cpu-ai.js:579-603 / `hintsListHTML()` `_hints` 40-ui-render.js:410-413 / `refreshHints` 50-input-cpu-ai.js:604 | **無い**（`predictCPU` は bootstrap.ts:44 でエンジン関数として公開だけ・UIから呼べない／`G._hints` 未表示） | 高 | サイドパネル内に予測タブ＋ボタンを置き `engine.predictCPU()` 呼出→`G._hints` を描画 |
| H3 | **ゲーム内ログ表示（logbox）** | `sidePanelHTML` logPanel 40-ui-render.js:405-407 / `log()` `flog()` 40-ui-render.js:26-35 | **部分的**（`engineStore.logs` に最新200件保存=engineStore.ts:58。だが**画面に出すビューが無い**＝死蔵） | 高 | サイドパネルのログタブで `store.logs` を時系列描画（cls別の色） |
| H4 | **前のCPUターン行動サマリ** | `sidePanelHTML` cpu-summary 40-ui-render.js:402 / `G._lastCpuSummary` 設定 50-input-cpu-ai.js:480 | **無い**（`G._lastCpuSummary` は engine が生成するが React は読まない） | 高 | サイドパネル予測タブ上部に `G._lastCpuSummary` を箇条書き表示 |
| H5 | **トラッシュ閲覧モーダル（クリック/タッチ）** | `showTrashModal()` 60-screens-init.js:378-386（クリック・タッチ両対応のグリッド） | **部分的**（Pile.tsx は **CSS hoverのfanのみ**＝タッチ端末で開けない。`trashtop` の title は「クリックで全表示」と書くが onClick未実装 Pile.tsx:75） | 高 | `trashtop` に onClick→全カードグリッドのモーダル（自分/相手 両方） |
| H6 | **カード長押し詳細（タッチ）** | `touchStart/touchMove/touchEnd` `showCardModal` `cardDetailHTML` 60-screens-init.js:352-376 | **無い**（Card.tsx は `onMouseEnter`のホバープレビューのみ Card.tsx:92-93。タッチ端末でカード詳細を見る手段ゼロ） | 高 | Card に長押し(~450ms)検出→中央モーダルで `cardDetailHTML` 相当を表示 |
| H7 | **ルール/ヘルプ表示** | `showRules()` `RULES_HTML` 60-screens-init.js:83-91 / `#rulesBtn` index.html:27 | **無い**（topbar にルールボタンが無い・RULES_HTML 未移植） | 高 | topbar に「ルール」ボタン＋モーダルで RULES_HTML を表示 |

### 優先度【中】

| # | 機能名 | 元の実装(ファイル:行) | React版の状態 | 影響 | 対応案(1行) |
|---|--------|----------------------|---------------|------|-------------|
| M1 | **対戦放棄の確認ダイアログ** | `menuBtnAction()` 50-input-cpu-ai.js:133（`confirm('デッキ選択に戻りますか？（対戦は破棄されます）')`） | **部分的**（App.tsx:72 「デッキ選択へ」は **確認なしで即破棄**。誤タップで対戦消失） | 中 | backToSelect 前に `confirm()`（または独自モーダル）を挟む |
| M2 | **ハンバーガーメニュー** | `buildHamMenu/toggleHam/closeHam/toggleAiHam` 50-input-cpu-ai.js:136-147 / `#hamBtn`#hamMenu index.html:30-31 | **無い**（ルール/デッキ選択/情報/AI切替を束ねるメニューが無い。狭幅レイアウトの導線が消失） | 中 | 狭幅時に H1/H7/M1 とAIトグルをまとめるメニューを追加 |
| M3 | **デッキリスト プレビュー（選択画面）** | `showDeckList(id)` 60-screens-init.js:92-106（全カード一覧・tier/style/再現度・[簡易]表示） | **無い**（DeckSelect は DeckCard の説明だけ。中身50枚を確認する手段が無い） | 中 | DeckCard に「中身を見る」→モーダルで list/tier/desc を表示 |
| M4 | **ターン表示(turnpill)の細部＝フェーズ名** | `setPhase()` `#phaseTag` 40-ui-render.js:12-22 / index.html:20（SETUP/MAIN/END 等） | **部分的**（App.tsx:57 は「ターンN・あなた/相手」のみ。**フェーズ名 `G.phase` を出していない**） | 中 | topbar の表示に `G.phase`（フェーズ名）を併記 |
| M5 | **音のミュートが効果音単位で復帰しない（要確認）** | `SFX.toggle()`/`sfx()` 抑止 40-ui-render.js:63-93 / soundBtn 60-screens-init.js:392-394 | **部分的（要確認）**（App.tsx の muted トグルは audio.ts 経由で機能。元の `SFX.unlock()` 初回アンロックは DeckSelect の `unlockAudio()` で代替＝概ね同等。差分は軽微） | 低〜中 | 動作確認のみ。問題なければクローズ |

### 優先度【低】

| # | 機能名 | 元の実装(ファイル:行) | React版の状態 | 影響 | 対応案(1行) |
|---|--------|----------------------|---------------|------|-------------|
| L1 | **先攻/後攻の明示表示** | `banner()` でターンバナー 30-flow-battle.js:292・元は firstPlayer を内部保持 | **部分的**（Banner.tsx で「あなた/相手のターン」は出る。だが**どちらが先攻か**の明示表示は元にも明確UIは薄い＝『要確認』） | 低 | 必要なら開始時バナー/topbarに「先攻: あなた」を1回表示 |
| L2 | **AIトグルのゲーム中切替（aiSwitch ON/OFF）** | `aiSwitch.onclick` 60-screens-init.js:391 / `toggleAiHam` 50-input-cpu-ai.js:147（対戦中に Claude助言 ON/OFF） | **部分的**（App.tsx:62-68 は**表示専用ラベル**＝`cursor:default`・対戦中の切替不可。元は対戦中トグル可） | 低 | ラベルをトグルボタン化し `G.aiOn` を反転（任意） |
| L3 | **部分更新ヘルパー（updateControls/updateHand/patchEl）** | 40-ui-render.js:446-450 | **不要**（Reactの差分描画＋zustandスライス購読で代替済。移植不要） | — | 対応不要 |

---

## 2. 既に同等実装済みの主要機能（簡潔）

- **盤面描画一式**: Side / Card / Hand / Controls / DonRow / Pile / LifeStack（`render()` の #board>.felt 構造を1:1再現）。
- **入力・クリック優先度**: interaction.ts が `onBoardClick` の優先度（pick→prompt→attackSel→自分メイン）を忠実再現。`openOwnMenu`/`beginAttack`/`tryPlayHand`/`declareAttack`/`uiEndTurn` 連携OK。
- **演出オーバーレイ**: Prompt（`showPrompt`/`humanPick`）, Banner（ターンバナー）, AtkAnnounce（攻撃演出＋`_atkFrom/_atkTo`グロー）, Toast, FxLayer（floatOn＋**showFxNote/fxNote の起動メイン等ピルも実装済**）, EndScreen（勝敗）, Thinking（AI思考バッジ）。
- **AIの狙い表示**: AIIntent.tsx が `G._aiIntent` を表示（条件 `aiOn && inGame`）＝**表示済**。
- **カードホバー詳細（デスクトップ）**: CardPreview.tsx（`onHover`/`cardDetailHTML` 相当・幅<=1000はCSSで非表示）＝デスクトップは同等。
- **デッキ選択**: 自分/相手デッキ選択・先攻設定・CPU強度（標準/Claude助言/強い探索）・BATTLE START＝同等。CPU強さUIは元の標準/強いに加え Claude助言モードも提供。
- **デッキビルダー**: リーダー選択・各種フィルタ・追加/削除・保存・**JSON書き出し（exportJSON DeckBuilder.tsx:118-151）**・インポート（DeckSelectのファイル取込＋クラウド保存）＝同等以上（クラウド同期は元に無い拡張）。
- **音**: audio.ts＋App のミュートトグルで効果音ON/OFF。

---

## 3. 元にも無い/不要と判断したもの

- **部分更新ヘルパー（patchEl/updateControls/updateHand/refreshActable）**: 元はフル再描画回避の最適化。Reactは差分描画＋zustandの専用スライス購読（hover等）で代替済＝移植不要（L3）。
- **`G._hints`/`G._koedThisTurn`/`G._sim` 等の内部フラグ**: AI探索・ターン内追跡用の内部状態。ユーザー表示対象ではない（`_hints` は H2 のデータ源としてのみ表示が必要）。
- **クラウド同期・ログイン（auth/decks）**: React版の**追加機能**（元バニラ版に無い）。パリティ対象外の純増。
- **先攻明示UI**: 元バニラ版にも独立した「先攻表示」UIは薄い（バナーで間接表現）。L1は『要確認』扱い。

---

## 補足（データはあるが未表示＝"死蔵"の明示）

- `store.logs`（最新200件・engineStore.ts:58 に蓄積）→ **画面に出すビューが無い**（H3）。
- `G._lastCpuSummary`（engine が 50-input-cpu-ai.js:480 で生成）→ **React は未読**（H4）。
- `G._hints`（`predictCPU` が生成）→ **呼び出すUIも表示も無い**（H2）。`predictCPU` 自体は bootstrap で公開済なので**配線だけ**で復活可能。
- `G._aiIntent` / `G._atkFrom` / `G._atkTo` は**表示済**（既存どおり）。

# 依頼: ワンピカード対戦シミュレーターのゲームプレイ画面 UI/UX 改善（モーダル/ダイアログ・スマホファースト）

あなたはこのリポジトリ（React18+Vite+Cloudflare / ルート=webアプリ、エンジンは `engine/` → `src/engine/raw/` に同梱）で作業します。
まず必ず `CLAUDE.md`（ルート）と `engine/CLAUDE.md` を読み、既存の作法（localStorage禁止・状態はG/zustand・sync-engine・テスト緑維持）に従ってください。

## スコープ（厳守）
- 対象は「ゲームプレイ画面（対戦中）」のモーダル/ダイアログ/確認UIのみ。デッキ選択・ログイン・ビルダーは触らない。
- AI・カード効果ロジック・ゲームルール・勝敗判定は変更しない（挙動を変えず、提示と操作性だけ改善）。
- スマートフォンファースト（縦長・親指操作・狭幅）を最優先。PCでも破綻させない。

## 直す問題（現状の実装を確認済み）
1. **見やすさ/スマホ**: 決断モーダル（`.prompt`）が画面最上部に固定で親指が届かない。ボタンのタップ高が44px未満。「使う/使わない」が隣接し取り違えタップしやすい。候補が多いカード選択は小画面で見切れる。背景スクリムが無く盤面と競合。
2. **文脈**: `confirmUse`系ダイアログが無記名で「どのカードの・リーダー効果か・何が得られるか」が分からず唐突。相手の行動で誘発する効果（onOppAttack/onBlock/trigger）ほど文脈が必要。効果告知 `fxNote` が一瞬で消え決断ダイアログと分離している。
3. **誤タップ救済**: ターン終了が確認なし。手札プレイ/アタック宣言/1枚ドン付与が1タップ即確定。不可逆コスト（手札破棄・ライフ使用等）の確認もタップ即解決。undoが無い。

## 要件

### R1. モーダルのスマホ最適化（React/CSSのみで可能・低リスク）
- `.prompt` をスマホで**画面下部（親指到達域）中心のボトムシート風**に。`env(safe-area-inset-bottom)` を尊重。PCは現状の中央上寄せ維持でよい。
- 選択肢ボタン（`.opt`/`.opt-card`）の**最小タップ高44px**、行間・余白を確保。モバイルは縦積みフル幅。
- **primary（実行）と cancel/ghost（取消）を物理的に離す**（例: 取消は独立行・十分なギャップ）。破壊的選択肢は danger 表示で分離。
- 背景に**薄いスクリム**を敷いて「今の決断」に視線を集める。ただし防御（counter/block）の「盤面を見る」peek導線は必ず維持。
- 候補が多いカード選択（`many-sel`＝4枚以上）でも**縦スクロールで全候補に到達でき、横スクロールは発生させない**。件数を明示。
- 文字サイズ・コントラストを上げ、要点（何をするか）が一読で分かるようにする。

### R2. 決断の文脈を示す（誘発効果の記名）
- 相手の行動で誘発する効果（onOppAttack/onBlock/trigger）と、コスト確認（`confirmUse`）ダイアログに**発生源を明記**する。
  例: 「リーダー効果『ナミ』」/「『カード名』の効果」（`ctx.self === P.leader` でリーダー効果か判定可）。可能なら得られる内容（例: パワー+2000）も一言添える。
- 実装は `engine/src/20-targeting-fx.js` の `confirmUse` と、それを呼ぶ各コストop、および `engine/src/30-flow-battle.js` の onOppAttack/onBlock 誘発箇所（`fxNote`）で発生源を渡す形が素直。**中央化して全確認ダイアログに一度で効かせる**こと。
- エンジンを編集したら必ず `cd engine && node tests/test.js` 緑 → ルートで `node scripts/sync-engine.mjs`。`src/engine/raw/` は手編集しない。

### R3. 誤タップ救済（真のundoは実装しない。確認ゲート＋取消で担保）
- **ターン終了は毎回確認する**（「ターンを終了しますか？」）。さらに、未使用のアクティブドンが残る／まだ攻撃可能なキャラがいる場合は、その旨を警告文として添えるとより親切（`engine.G.players.me.don.active` と `legalTargets`/`canCardAttack` で判定可）。React側（`src/components/battle/Controls.tsx`）で `engine.uiEndTurn()` の前段に確認を挟む実装が安全（エンジン非改変で可）。
- 手札破棄・ライフ使用など**不可逆コストの `confirmUse` は danger 表示**で、実行ボタンを取消と明確に分離。
- 各選択フローに**一貫した取消/閉じる**があること（既存の openOwnMenu 閉じる / attachDon やめる / 攻撃 取消 を踏襲し、抜けを埋める）。
- アタック最終宣言の確認は任意（対象選択に取消があるため）。入れるなら“詰め（リーサル）でない通常攻撃”に限る等、煩わしさとのバランスを取る。

## ハード制約（壊さないこと）
- **すべての showPrompt/humanPick は必ず resolve すること**（候補0→null等）。フリーズ厳禁（CLAUDE.md §5）。
- **AI探索中（`G._sim`）は一切のUI（モーダル/演出/確認）を出さない**。既存の reactAdapter は `sim()` でガード済み。新規UIも必ず同ガードを尊重（測定/決定性を壊さない）。
- localStorage/sessionStorage 禁止。状態は G / zustand。
- 変更後の検証を必ず通す:
  - エンジンを触った場合: `cd engine && node tests/test.js` 緑 → `node scripts/sync-engine.mjs` → ルート `npm test` と `npm run build`。
  - React/CSSのみの場合: `npm test` と `npm run build`。
- 横スクロールを絶対に発生させない。width は相対単位・`max-width:100%`。

## 関連ファイル（出発点）
- モーダル描画: `src/components/fx/Prompt.tsx`（.prompt/.opt/.opt-card/AttackHead/peek）
- モーダルCSS: `src/battle.css`（`.prompt` `#promptHost` `.opt` `.opt-card` `.opts` `.opt-cards` `.prompt-atkhead` `.prompt-peek-btn` `.peek-back` `.fx-note`、モバイルは `@media(max-width:680px)` 群と末尾 ~5055行の `.prompt` 上書き）
- 操作バー/ターン終了/攻撃取消: `src/components/battle/Controls.tsx`
- カードのタップ挙動: `src/components/battle/Card.tsx` ＋ `src/engine/interaction.ts`
- prompt/pick状態: `src/state/engineStore.ts`／エンジン→Reactブリッジ: `src/engine/reactAdapter.ts`
- エンジン側の確認/誘発: `engine/src/20-targeting-fx.js`(`confirmUse`)・`engine/src/50-input-cpu-ai.js`(`openOwnMenu`/`attachDonFlow`/`uiEndTurn`/`tryPlayHand`)・`engine/src/30-flow-battle.js`(onOppAttack誘発/`fxNote`)・`engine/src/40-ui-render.js`(`fxNote`)

## 進め方
1. 先に現状を読み、上記R1〜R3を満たす具体プランを短く提示（フェーズ分け推奨: フェーズ1=React/CSSのモバイル最適化＋誤タップ救済＝低リスク、フェーズ2=エンジン側の発生源記名＝要sync＆テスト）。
2. スマホ幅（例: 390×844）で実機/エミュ相当の見え方を確認（可能ならスクリーンショット）。少なくとも狭幅で横スクロールが無いこと・ボタンが親指域にあること・確認/取消が取り違えにくいことを確認。
3. 上記の検証コマンドを全て緑にしてから完了報告。挙動（ゲームルール）を一切変えていないことを明記。

# Phase 3 実装仕様書 — React + TypeScript + Framer Motion 対戦UI

> ワンピースカードゲーム対戦シミュレーターの **対戦UI（Battle画面）** を、現行バニラJSエンジンを温存したまま React で作り直す。**アニメ強化が主眼**。
> 本書は並列抽出した5本の仕様（G形状 / レイアウトCSS / 入力フロー / デッキ選択 / 演出棚卸し）を統合・重複排除し、矛盾は **現行コード優先** で解決したもの。
>
> 矛盾解決の指針: 仕様間でクラス名・数値・URL・関数シグネチャが食い違う場合は `src/*.js`・`css/styles.css`・`web/src/engine/*.ts` の実コードを真実源とする。本書のコード断片はその実コードに合わせて校正済み。
>
> **前提（既に存在する足場）**: `web/src/engine/bootstrap.ts`（`createEngine()`）・`web/src/engine/ui-adapter.ts`（`UIAdapter`/`PromptConfig`/`headlessAdapter`）・`web/src/engine/raw/*`（バニラJS verbatimコピー＋`manifest.json`）・`web/scripts/sync-engine.mjs`（raw同期）・`web/src/App.tsx`/`main.tsx`/`state/auth.ts`/`screens/Login.tsx`/`api/client.ts` は**実装済み**。Phase3 はこの上に DeckSelect と Battle を載せる。

---

## 1. 概要と方針

### 1.1 ゴール
- エンジンロジック（公式ルール準拠の巨大switch・効果システム・CPU/AI）は**一切書き換えない**。バニラJSを `web/src/engine/raw/` に verbatim コピーし、`createEngine()` が `new Function` で単一スコープ評価して公開APIを返す（既存）。
- UI（描画・入力・演出）だけを React + Framer Motion で**全面再実装**し、現行 `render()`/`floatOn()`/`animClass()`/`showAtkAnnounce()` 等の DOM 直書き演出を Framer Motion へ置換して**強化**する。

### 1.2 アーキテクチャ（データフロー）
```
                    createEngine({ ui: reactAdapter })  ← bootstrap.ts（実装済み）
                              │  返値 = EngineAPI（G / startGame / declareAttack / tryPlayHand ...）
                              ▼
  ┌──────────── engine (raw/*.js, anyの巨大グローバルG) ────────────┐
  │  render() 等の UIフックを footer で reactAdapter の実装へ再代入   │
  └───────────────┬───────────────────────────────▲──────────────┘
        フック発火 │ (render/floatOn/showPrompt...)  │ エンジンAPI呼び出し
                  ▼                                 │ (tryPlayHand/declareAttack/uiEndTurn...)
        ┌──────────────────────┐                    │
        │ engineStore (Zustand)│  version++ で再描画 │
        │  + fxBus(演出キュー)  │                    │
        └──────────┬───────────┘                    │
                   ▼ useEngineStore()                │
        ┌──────────────────────┐  onClick/onTap ─────┘
        │ React Components      │
        │ App→DeckSelect→Battle │
        └──────────────────────┘
```

- **エンジン起動**: `createEngine({ ui: makeReactAdapter(store), timers:'real', aiOn:false })`。返った `EngineAPI`（`G` 参照を含む）を Zustand に保持し、全コンポーネントから参照。
- **購読**: UIアダプタの `render` フックが呼ばれるたびに `store.bump()`（`version++`）。React は `version` の変化で再描画し、`engine.G` のスナップショットを読む（後述§2）。
- **入力**: React のクリック/タップハンドラがエンジンAPI（`tryPlayHand`/`attachDonFlow`/`declareAttack`/`uiEndTurn`/`leaderActivate`/`activateAbility`）を直接呼ぶ。エンジンが状態を進め、`render` フックで React に通知する一方向ループ。
- **モーダル選択**: エンジンが `showPrompt(cfg)`/`humanPick(cands,...)` を呼ぶ → アダプタが Promise を生成し store に `promptState`/`pickState` を積む → React がモーダル/盤面ハイライトを出す → ユーザー操作で Promise を resolve（§6）。

### 1.3 やらないこと（Phase3スコープ外）
- エンジン/効果ロジックの変更。CPU/AI の改良。
- デッキビルダー（作成画面）は Phase3 では DeckSelect の「組み込み7デッキ＋既存customDecks表示」までとし、編集UIは後続フェーズ。

---

## 2. 状態購読モデル

### 2.1 基本: version カウンタ + スナップショット読み
エンジンの状態 `G` は **可変な単一オブジェクト**（バニラJSのグローバル）。React の不変性前提と相性が悪いので、**「`G` を不変化せず、再描画トリガだけ Zustand で管理し、各コンポーネントはレンダー時に `engine.G` を直接読む」** 方式を採る（`tests/_load-app.js` の発想をブラウザへ移植）。

```ts
// engineStore.ts
interface EngineStore {
  engine: EngineAPI | null;     // createEngine の返値（G を内包）
  version: number;              // render フックのたびに ++（唯一の再描画トリガ）
  prompt: PromptState | null;   // showPrompt の現在値（モーダル用）
  pick: PickState | null;       // humanPick の現在値（盤面ハイライト用）
  fxQueue: FxEvent[];           // floatOn/animClass/atkAnnounce/banner/toast の演出イベント列
  ...
  bump(): void;                 // version++（render フックが呼ぶ）
}
```

- `render` フック実装 = `store.getState().bump()`（`set(s => ({version:s.version+1}))`）。
- コンポーネントは `const v = useEngineStore(s => s.version)` で version を購読し、本文では `const G = engine.G` を**直接読む**（`v` は依存にするだけで値は使わない）。これで「render() が `#screen` を作り直す」現行挙動と同じ「全再描画」を React の再描画に写像する。

### 2.2 再描画粒度
- **既定は粗粒度（盤面全体）**: 現行 `render()` が毎回 `#screen.innerHTML` を全再構築するのと等価。`Board` 配下が version 変化で丸ごと再評価される。
- **チラつき防止は Framer Motion の `layout` と React の key（`card.uid`）で吸収**: カードに `key={card.uid}`・`layoutId={card.uid}` を与えると、配列再生成でも DOM は維持され move/enter/exit がアニメする（§8）。粗粒度再描画でも視覚的に滑らか。
- **細粒度の最適化（任意・後回し）**: ホットなゾーン（Hand/CharArea）を `React.memo` でラップし、`useEngineStore` のセレクタを「そのゾーンの内容ハッシュ」にするのは可能。だが**初版は version 全再描画で十分**（盤面のカード総数は高々 数十）。早すぎる最適化はしない。

### 2.3 各キー状態の扱い
| 状態 | 出所 | React での扱い |
|---|---|---|
| `G.active` / `G.turnDisp` / `G.phase` / `G.busy` / `G.myActable` / `G.winner` | エンジン | version 経由で読み取り、Topbar/操作可否/EndScreen に反映 |
| `G.pendingChoice` `{uids:Set, optional?, danger?, res}` | `humanPick` がセット | **盤面ハイライト＋クリックで resolve**。アダプタの `humanPick` 実装が `store.pick` も立て、`Card` は `pick.uids.has(uid)` で `.selectable`/`.danger` を付ける（§6.2）。`G.pendingChoice` を真実源とし `store.pick` はその鏡。 |
| `G.promptState` `{title,text,opts,cls,pick}` | `showPrompt` がセット | アダプタが store.prompt に写し、`Prompt` モーダルを表示。ボタン押下で `cfg.onPick(v)`→Promise解決（§6.1）。 |
| `G.attackSel` `{attacker}` | `beginAttack` がセット | 「アタック対象選択中」。`attacker` をハイライト＋`legalTargets()` の対象に `.targetable`。盤面クリックで `declareAttack`（§7.3）。 |
| `G._atkFrom` / `G._atkTo`（uid） | `showAtkAnnounce` 周辺 | アタック演出のハイライト対象。`Card` が `uid===G._atkFrom`→`atk-active`、`===G._atkTo`→`atk-target`。`AtkAnnounce` の両カード表示にも使う（§8）。 |
| `G._sim` | AI探索中 | `true` の間は演出フック全スキップ（現行同様）。アダプタ側でも `if(G._sim)return;` を先頭に置く。 |

> **重要**: `G.pendingChoice`/`G.promptState`/`G.attackSel` は **エンジンが真実源**。store のミラー（`pick`/`prompt`）は「React が読みやすい形のコピー＋Promiseの resolver 保持」であって、二重管理にしない（アダプタのフック内で同時にセット/クリアする）。

---

## 3. TypeScript 型（UI境界）

エンジン側は `any`。**UI境界で型を当てる**（`web/src/engine/types.ts` に集約）。描画に必要な範囲のみ。実フィールドは spec「g-render-shape」準拠。

```ts
// web/src/engine/types.ts
export type Side = 'me' | 'cpu';

export interface GameState {
  players: { me: Player; cpu: Player };
  active: Side;
  firstPlayer: Side;
  phase: string;             // 'リフレッシュ'|'ドロー'|'ドン'|'メイン' 等（表示用）
  turnSeq: number;           // 内部連番（カード状態比較用）
  turnDisp: number;          // 画面表示ターン数
  busy: boolean;             // 処理中＝メイン操作不可
  winner: Side | null;
  myActable: boolean;        // 自分のメイン中で操作可能
  attackSel: { attacker: Card } | null;
  pendingChoice: {
    uids: Set<number>;
    optional?: boolean;
    danger?: boolean;
    res: (card: Card | null) => void;
  } | null;
  promptState: PromptState | null;
  log: Array<{ cls: string; html: string }>;
  inGame: boolean;
  _sim: boolean;
  _atkFrom?: number;
  _atkTo?: number;
  cpuStrength?: 'normal' | 'strong';
  firstPref?: 'random' | 'me' | 'cpu';
  sel?: { me?: string; cpu?: string };   // デッキ選択（id）
  customDecks?: Deck[];
  // 情報パネル系（任意・初版は未使用可）
  _hints?: Array<{ prob?: string; title?: string; desc?: string; warn?: boolean }>;
  _aiIntent?: string | null;
  _lastCpuSummary?: string[] | null;
}

export interface Player {
  id: Side;
  deckId: string;
  isCPU: boolean;
  meta: any;                 // デッキメタ（findDeck の返値）
  leader: Card;
  chars: Card[];             // 場のキャラ（最大5）
  stage: Card | null;
  hand: Card[];
  deck: Card[];              // 描画は length のみ
  life: Card[];              // 表/裏混在。_faceUp で表向き
  trash: Card[];
  don: { active: number; rested: number };
  donMax: number;            // ドンデッキ上限（enel=6, 他=10）
  turnsTaken: number;
  denyBlock: boolean;
  agent?: 'puct';            // CPU強さ（強い=puct）
}

export interface Card {
  uid: number;               // 一意。React key / data-uid / layoutId
  no: string;                // 'OP15-058'
  owner: Side;
  base: CardDef;
  attachedDon: number;       // 付与ドン枚数
  rested: boolean;
  summonedTurn: number;
  buffs: Array<{ amt?: number; setBase?: number; until?: string | number }>;
  kwGrant: Array<{ kw: string; dur?: string }>;
  frozen?: boolean;
  _faceUp?: boolean;         // ライフ表向き
  _actTurn?: number;
  negSeq?: number;           // 効果無効化ターン
  noAtkSeq?: number;         // アタック禁止ターン
}

export interface CardDef {
  no: string;
  name: string;
  type: 'CHAR' | 'LEADER' | 'EVENT' | 'STAGE';
  color: string[];
  cost: number;
  power: number;
  counter?: number;
  traits: string[];
  donDeck?: number;          // ドンデッキ上限
  life?: number;             // リーダーのライフ初期値
  leader?: string;           // リーダー固有ロジックキー
  blocker?: boolean;
  rush?: boolean;
  doubleAttack?: boolean;
  banish?: boolean;
  attribute?: string;        // 斬/打/射/特/知
  fx?: any;                  // 効果（UIは有無のみ参照）
  text: string;
  simp?: boolean;
}

export interface Deck {
  id: string;
  name: string;
  leader: string;            // リーダー card no
  colors: string[];
  tier: string;              // 'TIER 1'|'TIER 2'|'TIER 3'|'CUSTOM'
  usage: string;             // '19.1%'
  style: string;             // 'コントロール' 等
  accuracy: 'high' | 'mid';
  desc: string;
  list: Record<string, number>;
  custom?: boolean;
}

// UIアダプタ/モーダル（ui-adapter.ts と整合）
export interface PromptOption {
  t: string; v: any;
  card?: { no: string; sub?: string };
  primary?: boolean; ghost?: boolean; disabled?: boolean;
}
export interface PromptConfig {
  title?: string; text?: string; opts?: PromptOption[];
  onPick?: (v: any) => void; cls?: string;
}
// store に積む実体（pick は resolve 用に保持）
export interface PromptState extends PromptConfig { id: number; }
export interface PickState {
  id: number;
  uids: Set<number>;
  optional?: boolean;
  danger?: boolean;
  text?: string;
  resolve: (card: Card | null) => void;
}
```

---

## 4. コンポーネント構成

```
App                         （実装済み・auth分岐。user無→Login / 有→ホーム を DeckSelect/Battle へ拡張）
├─ Login                    （実装済み）
├─ DeckSelect               （新規。G.inGame=false のとき）
│   ├─ DeckGrid (×2: 自分 / CPU)
│   │   └─ DeckCard         （リーダー画像・tier・色ドット・ホバーpop）
│   ├─ FirstPrefSeg         （ランダム/あなた/CPU）
│   ├─ CpuStrengthSeg       （標準/強い(AI探索)）
│   └─ StartButton          （BATTLE START → startGame）
└─ Battle                   （新規。G.inGame=true のとき）
    ├─ Topbar               （ターン数/フェーズ/active色分け/ログアウト/サウンドトグル）
    ├─ Board
    │   ├─ Side(opp)        ├ CharArea / LeaderArea / Stage
    │   │                   ├ Zone:Life / Zone:Deck / Zone:Trash / DonRow / DonPile
    │   ├─ Midline
    │   └─ Side(me)         （点対称。同一構成）
    ├─ Hand                 （自分の手札。下部）
    ├─ Controls             （ターン終了ボタン・リーダー/起動メイン誘導・ヒント）
    ├─ SidePanel            （任意・初版は折りたたみ。log/hints）
    ├─ Prompt               （body直付け相当のモーダル。showPrompt 解決）
    ├─ AtkAnnounce          （アタック宣言演出。誰が誰に+P+両カード画像）
    ├─ FxLayer              （floatOn/animClass を担う演出オーバーレイ）
    ├─ Toast
    ├─ Banner               （ターン切替バナー）
    ├─ Thinking             （AI思考中バッジ）
    └─ EndScreen            （勝敗）
```

> **App の分岐**: `user` あり時に `engine.G.inGame ? <Battle/> : <DeckSelect/>` を返す（version 購読）。

### 4.1 props 概略
| Component | props（概略） |
|---|---|
| `DeckSelect` | なし（store から DECKS/sel/firstPref/cpuStrength を読む）。`onStart` は内部で `engine.startGame` |
| `DeckCard` | `{ deck: Deck; selected: boolean; onSelect: () => void; onShowList: () => void }` |
| `Board` | なし（store から両 Player を読む） |
| `Side` | `{ side: Side; player: Player }` |
| `CharArea` | `{ side: Side; chars: Card[] }`（5＋スロット） |
| `LeaderArea` | `{ side: Side; leader: Card; stage: Card \| null }` |
| `Zone`（Life/Deck/Trash 共通枠 or 個別） | `{ side: Side; player: Player }`（個別実装が読む配列を絞る） |
| `LifeStack` | `{ side: Side; life: Card[] }` |
| `DonRow` | `{ side: Side; don: {active,rested} }` |
| `DonPile` | `{ side: Side; left: number }`（`donMax - donTotal`） |
| `Card` | `{ card: Card; ctx: 'board'\|'hand'\|'life'\|'don'; faceDown?: boolean; onClick?: (c:Card)=>void; highlight?: 'selectable'\|'danger'\|'targetable'\|'atk-active'\|'atk-target'\|'usable' }` |
| `Hand` | `{ cards: Card[]; playable: (c:Card)=>boolean; onPlay: (c:Card)=>void }` |
| `Prompt` | `{ state: PromptState }`（store から） |
| `AtkAnnounce` | `{ aSide: Side; attacker: Card; target: Card; phase: 'declare'\|'block'\|'damage' }` |
| `Toast` | `{ items: {id,text}[] }` |
| `Banner` | `{ text: string; cls: 'mine'\|'opp' }` |
| `EndScreen` | `{ win: boolean; reason?: string; onBack: () => void }` |
| `Thinking` | `{ on: boolean }` |

---

## 5. レイアウト仕様（Arc1 の UX を厳守）

現行 `css/styles.css` の数値・URLを **そのまま** React 版へ移植する。CSS は `web/src/battle.css`（または CSS Modules）に切り出し、`--cu` 等のトークンを `:root` に置く。

### 5.1 盤面グリッドと点対称
```
#board { display:grid; grid-template-columns: 1fr var(--rail); }   /* --rail:286px（情報パネル幅） */
.felt  { display:flex; flex-direction:column; }
.side.me  { grid-template-areas:
            "life chars rhand"
            "life leader deck"
            "dondeck cost trash"; }
.side.opp { grid-template-areas:                /* 点対称（左右反転＋上下反転） */
            "trash cost dondeck"
            "deck leader life"
            "rhand chars life"; }
.side { gap: 8px 14px; padding: 6px 12px; }
```
- **ミラー配置**: `me` と `opp` は `grid-template-areas` の入れ替えで実現。背景グラデも 180° 反転（`me`=下→上, `opp`=上→下）。
- **ライフ**: 自分=左列 縦いっぱい（`grid-area:life; align-self:stretch`）、CPU=右列。**横向き（左が上＝270°回転）・表向き判定は `_faceUp`・サイズ統一**。積み重ね方向は z-index で制御（自分=下から上に重なる＝`zIndex: length-i`、CPU=上から下＝`zIndex: i+1`）。先頭（index0＝次に取られる）は自分側のみ枠強調（`.lifecard.up`＝`border-color:var(--gold)`）。
- **中央寄せ**: キャラ/リーダー/コストは中央列。`.charrow{ justify-content:center }`。
- **ドン2列回避**: `.donrow{ flex-wrap:wrap; max-width:calc(var(--cu)*4.6); }` で最大7枚を1列内に収め、重なり `margin-left:calc(var(--cu)*-0.62)`（1枚目は0）で折り返さない。
- **ラベル非表示**: ゾーンラベル（`.zlabel`）は出さない（枚数のみ）。デッキ/トラッシュ/ドンデッキは数字のみ。
- **STAGE 非表示の方針**: ステージは**ラベルを出さず**、リーダーの右に画像のみ（`margin-left:8px`）。

### 5.2 カード寸法トークン
```css
:root{
  --cu: clamp(36px, min(calc(8.5vh - 6px), calc((100vw - 16px - var(--rail))/9)), 58px);
  --rail: 286px;
  --r-card: 7px;
}
/* 標準カード: 幅 var(--cu) / 高さ calc(var(--cu)*1.4) */
/* ライフ（横向き）: 幅 calc(var(--cu)*1.4) / 高さ var(--cu) */
```
| 要素 | 重なり/間隔 |
|---|---|
| `.charrow` | `gap:6px; flex-wrap:nowrap; overflow:clip; overflow-clip-margin:36px` |
| `.donrow` doncard | `margin-left:calc(var(--cu)*-0.62)`（60%重なり） |
| `.lifecard` | `margin-top:calc(var(--cu)*-0.58)`（58%重なり） |
| `.handzone .card` | `margin:0 -5px`（20%重なり）。hover で `translateY(-22px) scale(1.12); margin:0 8px` |

### 5.3 カード画像 URL（IMG / IMG_ROT）
`web/src/engine/img.ts`（エンジン同梱の関数を再公開 or 再定義）:
```ts
export const IMG_RAW = (no: string) =>
  `https://www.onepiece-cardgame.com/images/cardlist/card/${no}.png`;
export const IMG = (no: string) =>
  `https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/images/cardlist/card/${no}.png&w=320`;
export const IMG_ROT = (no: string) =>   // ライフ横向き（270°回転）
  `https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/images/cardlist/card/${no}.png&ro=270&w=320`;
```
- フォールバック: `<img onError>` で weserv 失敗 → `IMG_RAW` → 再失敗で `.fallback`（カード名テキスト）。`referrerpolicy="no-referrer" decoding="async"`。
- 既知制約: プレビュー/CSP 環境では画像が出ないことがある（DOM/演出は動く）。

### 5.4 カード背面 / ドン画像（weserv パラメータ厳守）
CSS変数として `:root` に置く（現行 styles.css 61–70 と完全一致）:
```css
--img-back:
  url("https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/renewal/images/play-guide/img_deck01.png&cx=329&cy=0&cw=210&ch=328&output=webp&q=82")
  center/cover no-repeat,
  repeating-linear-gradient(135deg,#0f2c43 0 6px,#0b1d2c 6px 12px);   /* デッキ背面（縦） */

--img-back-life:
  url("https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/renewal/images/play-guide/img_deck01.png&ro=270&cx=0&cy=327&cw=328&ch=210&output=webp&q=82")
  center/cover no-repeat,
  linear-gradient(135deg,#34202c,#170d15);                            /* ライフ背面（横） */

--img-don-deck:
  url("https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/renewal/images/play-guide/img_deck01.png&cx=656&cy=21&cw=210&ch=307&bg=white&output=webp&q=82")
  center/cover no-repeat,
  radial-gradient(circle at 38% 28%,#caa24e,#7a5e22);                 /* ドンデッキ背面 */

--img-don:
  url("https://images.weserv.nl/?url=ssl:www.onepiece-cardgame.com/renewal/images/play-guide/card_don.webp&output=webp&q=82")
  center/cover no-repeat,
  radial-gradient(circle at 36% 26%,var(--gold-soft),var(--gold-dim));/* ドン!! カード */
```
- **ドン!! カード（コストエリア）**: 幅 `--cu`/高 `cu*1.4`。アクティブ=立て、レスト=`rotate(90deg) filter:grayscale(.5) brightness(.74)`。使用可能（手札プレイに足りる）=`box-shadow`金グロー（`.usable`）。
- **ドンデッキ / デッキ / トラッシュ**: `.pile`（枚数表示）。トラッシュは最新1枚画像＋枚数、ホバーで `.trashfan` 展開。

### 5.5 デザイントークン（色/フォント）
`:root` に現行 styles.css 1–70 を移植。主要:
```
--ocean-900:#06121b; --gold:#e9b949; --gold-dim:#b08a32; --gold-soft:#f5d98a;
--danger:#e0533c; --good:#48c98a;
--c-red:#d2473f; --c-green:#2f9e63; --c-blue:#3a7fc9; --c-purple:#9a57d4; --c-black:#5a6170;
--self-accent:#5aa9e6; --opp-accent:#e5836f;
--legal:var(--good); --legal-glow:#6fe6ab; --illegal:#3b4a57; --warn:var(--gold);
--r:10px; --r-sm:6px; --r-card:7px; --rail:286px;
```
- フォント: 表示名/数値=`"Bebas Neue"`、本文=`"Noto Sans JP"`。背景=深い海色グラデ＋北極光。

---

## 6. アダプタ実装仕様（`web/src/engine/reactAdapter.ts`）

`makeReactAdapter(store)` が `UIAdapter` を返す。`createEngine({ ui })` に渡す。各フックは `if (G._sim) return;`（演出系）で先頭ガード。`G` は `store.getState().engine!.G`。

| フック | React 実装 |
|---|---|
| `render()` | `store.bump()`（version++）。**唯一の再描画トリガ**。これだけで盤面全体が React 再評価。 |
| `log(cls, html)` / `flog(side,text)` | `store.pushLog({cls,html})`。SidePanel が読む（初版は溜めるだけでも可）。 |
| `toast(text)` | `store.pushFx({type:'toast', id, text})`。`Toast` が AnimatePresence で表示・1s で自動 dismiss。 |
| `floatOn(uid,text,kind)` | `store.pushFx({type:'float', id, uid, text, kind})`。`FxLayer` が対象カードの矩形上に `motion.div` を spring で浮かせ exit（§8）。 |
| `animClass(uid,cls)` | `store.pushFx({type:'anim', id, uid, cls})`。`Card` が自分の uid に一致する未消化 anim を見て variant 発火（enter/ko/shake/dmg/lunge）。680ms 相当で消える。 |
| `showFxNote(side,label,name)` / `fxNote(...)` | `store.pushFx({type:'fxnote', id, side, label, name})`。`FxLayer` がピル（効果発動通知）をスライドイン、1.4s で退場。`fxNote` は async（me=340ms / cpu=660ms 待つ）で**Promise を返す**＝エンジンの await を満たすため、push 後に `realSetTimeout` で resolve。 |
| `showAtkAnnounce(aSide,attacker,target)` | `store.setAtk({aSide, attacker, target, phase:'declare'})`。`AtkAnnounce` が表示。phase は block/damage で更新（同 setter を呼び直す）。 |
| `clearAtkAnnounce()` | `store.setAtk(null)`。`G._atkFrom/_atkTo` も null になる（エンジン側）。 |
| `showEndScreen(win,reason)` | `store.setEnd({win, reason})`。`EndScreen` 表示＋`sfx(win?'win':'lose')`。 |
| `showThinking(on)` | `store.setThinking(on)`。`Thinking` バッジ。 |
| `sfx(name)` | `audio.play(name)`（§9。WebAudio合成を React 側に移植）。 |
| `showPrompt(cfg)` | **Promise を返す**（§6.1）。 |
| `humanPick(cands,text,optional,cls)` | **Promise を返す**＋盤面ハイライト（§6.2）。 |
| `chooseCard` | アダプタでは差し替えない（エンジン原本の `chooseCard` が CPU分岐＋1件即決を処理し、人間時に `humanPick` を呼ぶ）。`HOOKS` に含まれるが React 実装は不要 → 省略可。 |

### 6.1 `showPrompt` → Promise（React モーダル）
```ts
showPrompt(cfg: PromptConfig): Promise<any> {
  return new Promise((resolve) => {
    const id = ++promptId;
    store.setPrompt({
      id, ...cfg,
      onPick: (v: any) => {
        store.setPrompt(null);
        cfg.onPick?.(v);   // エンジン側の元 onPick も尊重（showPrompt 原本が pick で resolve する設計に合わせ二重発火しないよう注意）
        resolve(v);
      },
    });
  });
}
```
- `Prompt` コンポーネントは `store.prompt.opts` をボタン列（`primary`=太字 / `ghost`=退色 / `disabled`=不可 / `card`=画像サムネ付き）で描き、クリックで `prompt.onPick(v)`。
- モーダルは `body` 相当のトップレベル（`Battle` 直下、`position:fixed` オーバーレイ `#promptHost`）。`G.busy` でも表示される（防御プロンプトは相手ターン中に出る）。

### 6.2 `humanPick` → 盤面ハイライト + クリック resolve（pendingChoice 配線）
```ts
humanPick(cands, text, optional, cls): Promise<Card | null> {
  const list = (cands || []).filter(Boolean);
  if (list.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = ++pickId;
    const uids = new Set(list.map(c => c.uid));
    const finish = (card: Card | null) => { store.setPick(null); resolve(card); };
    // 盤面ハイライト用ミラー
    store.setPick({ id, uids, optional, danger: cls === 'danger', text, resolve: finish });
    // フォールバックのボタンモーダルも同時に出す（原本 humanPick と同等のUX）
    store.setPrompt({
      id: -id, cls: cls || '', title: '対象を選択',
      text: (text || '対象を選んでください') + ` 候補 ${list.length}`,
      opts: [
        ...list.map(c => ({ t: c.base.name, v: 'pick:' + c.uid, card: { no: c.base.no, sub: cardBtnSub(c) } })),
        ...(optional ? [{ t: '選ばない（スキップ）', v: '__skip', ghost: true }] : []),
      ],
      onPick: (v: any) => {
        store.setPrompt(null);
        if (typeof v === 'string' && v.startsWith('pick:')) {
          const u = +v.slice(5); finish(list.find(c => c.uid === u) || (optional ? null : list[0]));
        } else finish(optional ? null : list[0]);   // __skip / 想定外でも必ず解決
      },
    });
  });
}
```
- **盤面クリック経路**: `Card` の onClick が「`store.pick` があり `pick.uids.has(uid)`」のとき `pick.resolve(card)`（＝モーダルも閉じる）。これが現行 `onBoardClick` の最優先分岐（pendingChoice）に対応。
- **ハイライト**: `Card` は `pick.uids.has(uid)` で `.selectable`（金パルス `gpulse`）、`pick.danger` なら `.danger`（危険色パルス）を付ける。
- **空候補で即 null / `__skip` で null / 想定外でも必ず resolve**（フリーズ厳禁。現行の堅牢化を踏襲）。

---

## 7. 入力フロー

すべて **`Card`/ボタンの onClick → エンジンAPI 呼び出し**。優先度は現行 `onBoardClick`（50-input-cpu-ai.js）に一致させる。

### 7.0 クリック解決の優先度（Card.onClick 内 or 親で集約）
```
1. pick（pendingChoice）あり & pick.uids.has(uid) → pick.resolve(card)
2. pick あり（別カード） → 無視
3. prompt あり → 盤面クリック無視（モーダルのみ）
4. attackSel あり → attacker再クリックでキャンセル / legalTargets に含む対象なら declareAttack
5. メイン中(active==='me' && myActable && !busy):
     手札カード → tryPlayHand(card)
     自分のleader/char/stage → openOwnMenu(card)（ドン付与/アタック/起動メイン）
```

### 7.1 手札プレイ
- **対象**: `Hand` 内のカードクリック。
- **可否**: `handPlayable(card)`（=`effCost('me',card) <= P.don.active` ＋種別条件）で `.playable`（緑枠）表示。
- **API**: `engine.tryPlayHand(card)`。CHAR=summon＋onPlay、STAGE=既存trash送り＋設置、EVENT=`main.fx` 実行。

### 7.2 ドン付与
- **対象**: 自分の leader/char クリック → `openOwnMenu` 相当のミニメニュー（React の小ポップ or Prompt）で「ドン付与」選択。
- **API**: `engine.attachDonFlow(card)`。アクティブ複数枚なら枚数選択 Prompt（`showPrompt`）→ `attachedDon += n; don.active -= n`。
- **演出**: `floatOn(uid,'ドン+N','buff')`。

### 7.3 アタック宣言 + 対象選択
- **宣言**: 自分の char/leader メニューの「アタック」→ `engine.beginAttack(card)`（`G.attackSel={attacker}`）。
  - 実際には `beginAttack` は `legalTargets('me').length===0` を toast で弾く。
- **対象選択**: `attackSel` 中、盤面の相手 leader/char で `legalTargets('me', attacker)` に含むものに `.targetable`（危険パルス `tpulse`）。クリックで `engine.declareAttack(attacker, target)`。attacker 再クリックでキャンセル。
- **declareAttack 内フック順（不変）**: アタック宣言→【アタック時】→対象変更(黒ひげ)→ブロック→カウンター→パワー比較→ダメージ。この過程で `showAtkAnnounce`/`fxNote`/`floatOn`/`animClass('lunge')`/`sfx('attack')` が発火。

### 7.4 ターン終了
- **対象**: `Controls` のターン終了ボタン。
- **API**: `engine.uiEndTurn()`（`busy/active/myActable/prompt/pick` ガード内蔵）。

### 7.5 リーダー / 起動メイン
- **リーダー起動メイン**: leader メニューの「起動メイン」→ `engine.leaderActivate('me')`（enel/lucy/データ駆動 fx.act）。条件不足は toast。
- **キャラ起動メイン**: char メニューの「起動メイン」→ `engine.activateAbility(card)`（コスト検証→支払→`runFx(act.fx)`）。
- メニュー項目は「そのカードで可能な行動」だけ出す（ドン付与/アタック/起動メイン）。可能行動0なら toast。

### 7.6 カウンター（防御）
- **発火**: 相手アタック解決中、エンジンが `counterStep` で `showPrompt({cls:'defense', title:'🛡 カウンター — あなたの防御', opts:[...手札カウンター10件, リーダー反応, {t:'カウンター終了', v:'__done', primary}]})` を**ループ**で出す。
- **React**: `Prompt` の `defense` クラスで防御UI。支払い不可カウンターは `disabled`。`__done` でループ終了。
- ループ式＝複数回カウンター可（現行同様）。

### 7.7 トリガー
- **発火**: `dealLeaderDamage`→`askTrigger` が `showPrompt({cls:'defense', title:'⚡ トリガー', opts:[{t:'発動する',v:true,primary},{t:'手札に加える',v:false,ghost}]})`。
- **演出**: 発動時 `sfx('trigger')`＋`fxNote('トリガー発動')`（黄発光）。

### 7.8 ブロック
- **発火**: `chooseBlocker` が `showPrompt({cls:'defense', title:'🛡 ブロック — あなたの防御', opts:[...{t:名前,v:'blk:uid',card:{no,sub:'🛡 P'}}, {t:'ブロックしない',v:'__skip',ghost}]})`。
- **成立演出**: `floatOn(blocker,'🛡 BLOCK','buff')`＋`sfx('block')`＋`showAtkAnnounce` をブロッカーに更新（phase:'block'）。

### 7.9 マリガン
- **発火**: `startGame`→`mulliganPhase` が `showPrompt({title:'マリガン', opts:[{t:'引き直す',v:true},{t:'この手札でいく',v:false,primary}]})`。
- **React**: 通常モーダルで処理。CPU は自動。

### 7.10 デッキ選択 → 開始
- `DeckCard` クリック → `engine.G.sel[side]=id`（自分/CPU の2グリッド）→ `bump()`。
- `FirstPrefSeg`→`G.firstPref`、`CpuStrengthSeg`→`G.cpuStrength`。
- BATTLE START → `await engine.startGame(G.sel.me, G.sel.cpu)`。直後 `if (G.cpuStrength==='strong') G.players.cpu.agent='puct'`（enel は内部で素heuristicフォールバック）。`startGame` 内で mulligan→ライフ初期化→`beginTurn`。

---

## 8. アニメーション設計（Framer Motion・強化が主眼）

現行の DOM 直書き演出（`floatOn`/`animClass`/`fxNote`/`showAtkAnnounce`/`banner`/`endscreen`）を **Framer Motion へ全面置換**。レイアウト移動は `layout`/`layoutId`、出入りは `AnimatePresence`、状態遷移は `variants`。

### 8.1 カード本体（layout / AnimatePresence / variants）
- 各 `Card` は `motion.div` で `layout layoutId={card.uid}`。配列再生成（render）でも **move（位置補間）/enter/exit** が自動アニメ。
- `AnimatePresence` を CharArea/Hand/LifeStack に被せ、KO/プレイ/ライフ取得の **exit** を表現。
- `animClass` 由来の状態は variant で発火（store の未消化 anim を `Card` が拾い、`animate` を一時切替→`onAnimationComplete` で消化）:

| event | 旧cls/keyframe | Framer 表現 |
|---|---|---|
| 登場 | `enter`/`cardenter` (0.32s) | `initial:{scale:.7,opacity:0,y:24}` → `animate:{scale:1,opacity:1,y:0}`（spring）＋`sfx('summon')` |
| アタック | `lunge`/`lunge up` (0.42s) | 自分=`y:[0,-30,0]` / 相手=`y:[0,30,0]`＋`scale:[1,1.06,1]`。発火前に `sfx('attack')`（先行音） |
| KO | `ko`/`koanim` (0.45s) | `exit:{scale:.4, rotate:20, opacity:0, filter:'grayscale(1)'}`＋`sfx('ko')` |
| ダメージ揺れ | `shake`/`shake` (0.4s) | `x:[0,-5,5,-5,5,0]`（防御側が耐えた時） |
| リーダー被弾 | `dmg`/`dmgflash` (0.5s) | `filter:['brightness(1)','brightness(2)','brightness(1)']`＋danger glow、`floatOn('-1')`＋`sfx('hit')` |
| 攻撃対象パルス | `tpulse` | `targetable` variant: `boxShadow` 危険色の loop（`repeat:Infinity`） |
| 選択可パルス | `gpulse` | `selectable` variant: 金 boxShadow loop |

### 8.2 floatOn（フローティングテキスト）→ FxLayer
- `store.fxQueue` の `float` イベントを `AnimatePresence` で描く。対象カードの矩形（`getBoundingClientRect` or `layoutId` 追従）上に `motion.div`:
  ```
  initial:{opacity:0, y:6, scale:.8}
  animate:{opacity:[0,1,1,0], y:-46}     // 旧 floatup（1s, translateY -46px）
  exit:{opacity:0}
  ```
- `kind` で色: `buff`=金/上、`dmg`=赤/下寄り、`heal`=緑/上。例: `+3000`(buff)/`-2000`(dmg)/`LIFE+1`(heal)/`🛡 BLOCK`/`GUARD`/`無効`/`ドン+N`。
- **強化**: spring + わずかな blur-in、数値は太字 Bebas。同一カードに複数 float は縦オフセットで重ならせる。

### 8.3 fxNote（効果発動ピル）→ FxLayer
- 画面上部のピル。`label`（登場時効果/アタック時効果/KO時効果/トリガー発動/起動メイン 等）＋カード名。
- `initial:{opacity:0,y:-12}` → `animate:{opacity:1,y:0}`（fxNoteIn 0.22s）→ 1.4s 後 exit。`side` で左右や色（me=自陣青/cpu=敵赤）を分け、**強化**として layout 連結（複数ピルは縦に積みつつ reorder）。
- `fxNote`（async）はアダプタが push 後に `realSetTimeout(resolve, side==='me'?340:660)` で Promise 解決（エンジンの await を満たす）。

### 8.4 showAtkAnnounce（アタック宣言演出・強化の目玉）
- **「誰が誰に + パワー + 両カード画像」** を大きく見せる。`AtkAnnounce` は `aSide` で下(me)/上(cpu)からスライドイン。
  ```
  layout: [攻撃側カード画像+名前+大パワー]  ⚔  [防御側カード画像+名前+大パワー]
  ```
- phase 遷移: `declare`（宣言・両P表示）→`block`（ブロッカーに差し替え・盾アイコン）→`damage`（カウンター反映後の最終P。数値を旧→新へ count-up アニメ、差分を small で表示）。
- `motion.div` スライドイン＋`scale`、パワー数値は `useSpring`/`animate` で数字補間。`_atkFrom`/`_atkTo` のカードは盤面側でも `atk-active`/`atk-target` グロー。

### 8.5 その他イベント
| event | 表現 |
|---|---|
| ドロー | 手札に `enter`（横からスライドイン）＋`sfx('draw')`。beginTurn のドローフェーズで発火 |
| ドン付与 | コストエリアの doncard が `enter`＋`floatOn('ドン+N')`＋`sfx('don')`。ドンデッキ→コストの移動は layout で補間 |
| ライフダメージ | §8.1 リーダー被弾＋ライフ1枚 exit |
| トリガー | §8.3 fxNote＋黄発光オーバーレイ |
| 効果発動 | §8.3 fxNote（起動メイン=ゴールド強調） |
| ターン切替 | `Banner`: 中央展開 `scale:[.7,1,1.12]`＋opacity点滅（旧 tbnr 1.6s）。me=`mine`色 / cpu=`opp`色。1.6s で AnimatePresence exit |
| 勝敗 | `EndScreen`: win=金背景＋レイ回転(`rotate 360` 26s loop)＋グロー(`scale 1↔1.12`)＋リング拡大(`scale .1→28`)＋粒子。lose=暗黒＋ビネット＋雨。`sfx(win?'win':'lose')` |
| AI思考 | `Thinking`: 上部固定バッジ「🤖 AI思考中…」回転/パルス、`on=false` で fade out |

- **音同期**: 多くの sfx は対応アニメの開始/`onAnimationComplete` に合わせて鳴らす（§9）。`attack` だけ先行音（アニメ前）。

### 8.6 置換マッピング早見表
| 旧フック | 旧実装 | Phase3 |
|---|---|---|
| `floatOn` | `setTimeout(680/1000)` で div 生成・削除 | `FxLayer` + `AnimatePresence`（spring/fade）|
| `animClass` | `classList.add`→680ms `remove` | `Card` variant（store の未消化 anim 消化）|
| `fxNote`/`showFxNote` | 静的ピル＋sleep | layout ピル＋`AnimatePresence`、async は realSetTimeout で resolve |
| `showAtkAnnounce` | `#atkAnnounce` div 固定 | `AtkAnnounce` slide-in＋数値補間＋phase更新 |
| `banner` | `.flash` フェード | `Banner` keyframes（scale+opacity）|
| `endscreen` | CSS 粒子 | `EndScreen` motion 多層（レイ/グロー/リング/粒子）|

---

## 9. 音（sfx）

WebAudio 合成を **エンジンの SFX 実装（40-ui-render.js 63–92）をそのまま React 側へ移植**（`web/src/audio.ts`）。エンジンの `sfx` フックはこの `audio.play(name)` に配線。`G._sim` 中は無音。

```ts
// audio.ts（oscillator合成。tone(freq, dur, type, gain, when)）
//  g.gain: setValueAtTime(0.0001)→exponentialRampTo(gain, +0.012)→exponentialRampTo(0.0001, +dur)
const lib = {
  click:   () => tone(420, .05, 'triangle', .06),
  summon:  () => { tone(330,.12,'triangle',.11); tone(495,.13,'sine',.09,.06); },
  attack:  () => { tone(190,.12,'sawtooth',.11); tone(120,.15,'square',.06,.04); },
  hit:     () => tone(90,.18,'square',.15),
  ko:      () => { tone(160,.2,'sawtooth',.13); tone(80,.28,'square',.11,.07); },
  block:   () => { tone(620,.09,'sine',.1);  tone(780,.11,'sine',.07,.05); },
  counter: () => tone(540,.1,'triangle',.09),
  draw:    () => { tone(520,.07,'sine',.07); tone(680,.08,'sine',.06,.05); },
  don:     () => tone(300,.08,'triangle',.09),
  trigger: () => { tone(700,.1,'sine',.1);   tone(950,.12,'sine',.08,.06); },
  win:     () => [523,659,784,1047].forEach((f,i)=>tone(f,.3,'triangle',.13,i*.12)),
  lose:    () => [392,330,262,196].forEach((f,i)=>tone(f,.34,'sine',.11,i*.14)),
};
```
- **name 一覧**: `click / summon / attack / hit / ko / block / counter / draw / don / trigger / win / lose`。
- **unlock**: AudioContext は最初のユーザー操作（BATTLE START 等）で `ctx.resume()`。mute トグルを Topbar に置く。
- **方針**: 効果音ファイルは持たず **WebAudio 合成**（既存と同一・ホットリンク不要・軽量）。Framer の `onAnimationComplete` でタイミング微調整可。

---

## 10. 実装タスク分解（ファイル単位・並列可）

> 既存（`bootstrap.ts`/`ui-adapter.ts`/`raw/*`/`App.tsx`/`Login.tsx`/`auth.ts`/`api/client.ts`）は流用。新規/変更のみ列挙。`[P]`=他と独立に並列実装可。

### 10.1 基盤（先行・他が依存）
| ファイル | 責務 |
|---|---|
| `web/src/engine/types.ts` `[P]` | §3 の UI境界型（GameState/Player/Card/CardDef/Deck/Prompt/Pick）。**最初に確定**（全UIが import）。 |
| `web/src/state/engineStore.ts` | Zustand store。`engine`/`version`/`prompt`/`pick`/`fxQueue`/`atk`/`end`/`thinking`/`log`＋ setter（`bump`/`setPrompt`/`setPick`/`pushFx`/`setAtk`/`setEnd`/`setThinking`/`pushLog`）。`initEngine()` で `createEngine({ui:makeReactAdapter(store)})`。 |
| `web/src/engine/reactAdapter.ts` | §6 の `makeReactAdapter(store)`（全フックを store へ配線。showPrompt/humanPick の Promise）。 |
| `web/src/engine/img.ts` `[P]` | §5.3 IMG/IMG_RAW/IMG_ROT。 |
| `web/src/audio.ts` `[P]` | §9 WebAudio 合成（tone/lib/unlock/mute）。 |
| `web/src/battle.css` | §5 トークン＋盤面 grid＋ゾーン寸法＋背面/ドン CSS変数。現行 styles.css から該当範囲を移植。 |

### 10.2 画面骨格
| ファイル | 責務 |
|---|---|
| `web/src/App.tsx`（変更） | user有時に `engine.G.inGame ? <Battle/> : <DeckSelect/>`。`useEffect` で `initEngine()`（未生成なら）。version 購読。 |
| `web/src/screens/DeckSelect.tsx` | §1/§5/§7.10。DeckGrid×2＋FirstPrefSeg＋CpuStrengthSeg＋StartButton。`engine.DECKS`＋`G.customDecks`。 |
| `web/src/screens/Battle.tsx` | §4 ツリーのルート。Topbar/Board/Hand/Controls/SidePanel＋オーバーレイ群（Prompt/AtkAnnounce/FxLayer/Toast/Banner/EndScreen/Thinking）をマウント。 |

### 10.3 デッキ選択 部品 `[P]`（DeckSelect 確定後）
| ファイル | 責務 |
|---|---|
| `web/src/components/deck/DeckCard.tsx` | リーダー画像(IMG)＋tierbadge＋色ドット＋使用率＋ホバーpop(desc/style/accuracy)＋selハイライト。 |
| `web/src/components/deck/CardPreview.tsx` | onHover プレビュー（`C[no]` から cardDetailHTML 相当。mousemove 追従・幅<1000で非表示）。 |
| `web/src/components/common/Seg.tsx` | セグメントコントロール（FirstPref / CpuStrength 共通）。 |

### 10.4 盤面 部品 `[P]`（types/store 確定後、相互独立）
| ファイル | 責務 |
|---|---|
| `web/src/components/battle/Board.tsx` | grid。Side(opp)/Midline/Side(me)。 |
| `web/src/components/battle/Side.tsx` | 片側の grid-areas 配置（me/opp の点対称）。 |
| `web/src/components/battle/Card.tsx` | **中核**。`motion.div layout layoutId`＋画像/フォールバック＋power表示＋highlight＋anim variant 消化＋onClick 優先度（§7.0）。 |
| `web/src/components/battle/CharArea.tsx` | 5キャラ＋スロット（AnimatePresence）。 |
| `web/src/components/battle/LeaderArea.tsx` | leader＋stage（右隣画像のみ）。 |
| `web/src/components/battle/LifeStack.tsx` | 横向き積み重ね・z-index反転・先頭枠（§5.1）。 |
| `web/src/components/battle/DonRow.tsx` | コストエリア（active立て/restは回転・usableグロー・最大7枚1列）。 |
| `web/src/components/battle/Pile.tsx` | Deck/Trash/DonPile 共通（枚数・背面・トラッシュfan）。 |
| `web/src/components/battle/Hand.tsx` | 手札（20%重なり・hover上昇・playable緑枠・onClick→tryPlayHand）。 |
| `web/src/components/battle/Topbar.tsx` | ターン数/フェーズ/active色/サウンドmute/ログアウト。 |
| `web/src/components/battle/Controls.tsx` | ターン終了ボタン＋（任意）リーダー/起動メイン誘導。 |
| `web/src/components/battle/OwnMenu.tsx` | 自カードクリック時の行動ミニメニュー（ドン付与/アタック/起動メイン）。 |

### 10.5 演出オーバーレイ `[P]`（store の fxQueue/atk/end/thinking 確定後）
| ファイル | 責務 |
|---|---|
| `web/src/components/fx/Prompt.tsx` | §6.1 モーダル（opts/primary/ghost/disabled/cardサムネ、defenseクラス）。 |
| `web/src/components/fx/FxLayer.tsx` | §8.2/§8.3 float＋fxNote を AnimatePresence で。対象カード矩形追従。 |
| `web/src/components/fx/AtkAnnounce.tsx` | §8.4 アタック宣言（両カード画像＋P＋phase更新＋数値補間）。 |
| `web/src/components/fx/Toast.tsx` | §6 トースト（中央・1s）。 |
| `web/src/components/fx/Banner.tsx` | §8.5 ターン切替バナー。 |
| `web/src/components/fx/EndScreen.tsx` | §8.5 勝敗（win多層/lose暗黒）＋戻るボタン→`backToSelect`相当（`G.inGame=false`）。 |
| `web/src/components/fx/Thinking.tsx` | §8.5 AI思考バッジ。 |

### 10.6 テスト/同期
| ファイル | 責務 |
|---|---|
| `web/scripts/sync-engine.mjs`（既存） | raw 同期（manifest）。変更不要。 |
| `web/tests/engine-port.test.ts`（既存） | エンジン移植回帰。Phase3 で adapter（headless）経由の1局完走を追加可。 |
| `web/tests/adapter.test.ts` `[P]`（新規・任意） | `makeReactAdapter` の showPrompt/humanPick が Promise を resolve することの単体検証。 |

### 10.7 並列実行プラン
1. **直列の起点**: `types.ts` → `engineStore.ts` + `reactAdapter.ts`（同時可）→ App 配線。
2. **以降は全並列**: 10.3（deck部品）/ 10.4（盤面部品・各ファイル独立）/ 10.5（演出・各ファイル独立）/ `img.ts`/`audio.ts`/`battle.css` は最初から並列。
3. 結合は `Battle.tsx`/`DeckSelect.tsx` で行い、最後に演出（FxLayer/AtkAnnounce）を磨く。

---

## 付録: 主要な決定の要約
- **エンジン無改変**: `createEngine({ui})` の既存契約に乗る。UIフックを React アダプタへ差し替えるだけ（`render`=`version++`）。
- **購読**: 粗粒度（version 全再描画）＋ `key/layoutId=uid` で Framer が move/enter/exit を吸収。早すぎる細粒度最適化はしない。
- **真実源は G**: `pendingChoice`/`promptState`/`attackSel` はエンジン。store の `pick`/`prompt` はミラー＋Promise resolver。
- **選択は2経路**: `showPrompt`=モーダル、`humanPick`=盤面ハイライト＋モーダル併用、どちらも「空候補/想定外で必ず resolve」（フリーズ厳禁）。
- **レイアウト数値**: `--cu=clamp(36px, …, 58px)`、カード=`cu×cu*1.4`、ライフ横向き=`cu*1.4×cu`（重なり -58%）、ドン重なり -62%（最大幅 `cu*4.6` で1列）、手札重なり -5px。点対称は grid-template-areas 反転＋z-index反転。
- **画像URL**: `IMG=weserv …&w=320`、`IMG_ROT=…&ro=270&w=320`。背面/ドンは weserv の crop（cx/cy/cw/ch）付き正確URLを CSS変数で保持（§5.4）。
- **アニメ方針**: floatOn→FxLayer(AnimatePresence)、animClass→Card variant、atkAnnounce→両カード+P+phase の slide-in、勝敗→多層 motion。アタック宣言演出が強化の目玉。
- **音**: WebAudio 合成12種（ファイル無し）。エンジンの tone 定義を移植。

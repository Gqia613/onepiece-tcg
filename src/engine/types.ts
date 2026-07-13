// UI境界の型。エンジン側は any（巨大グローバルG）。描画に必要な範囲だけ型を当てる。
// 実フィールドは src/10-engine-core.js / 40-ui-render.js 準拠。不確実なものは optional。
export type Side = 'me' | 'cpu';

export interface CardDef {
  no: string;
  name: string;
  type: 'CHAR' | 'LEADER' | 'EVENT' | 'STAGE';
  color: string[];
  cost: number;
  power: number;
  counter?: number;
  traits?: string[];
  donDeck?: number;
  life?: number;
  leader?: string;
  blocker?: boolean;
  rush?: boolean;
  doubleAttack?: boolean;
  banish?: boolean;
  attribute?: string; // 斬/打/射/特/知
  fx?: any;
  text?: string;
  triggerText?: string; // 【トリガー】全文（cards-trigger.js 由来・表示用）
  sets?: string[];      // 収録弾コード（cards-sets.js 由来。番号の接頭辞≠弾＝再録があるため。デッキビルダーの弾フィルタが参照）
}

export interface Card {
  uid: number;
  no: string;
  owner: Side;
  base: CardDef;
  attachedDon: number;
  rested: boolean;
  summonedTurn?: number;
  buffs?: Array<{ amt?: number; setBase?: number; until?: string | number }>;
  kwGrant?: Array<{ kw: string; dur?: string }>;
  frozen?: boolean;
  _faceUp?: boolean; // ライフ表向き
  negSeq?: number;
  noAtkSeq?: number;
  [k: string]: any;
}

export interface Player {
  isCPU: boolean;
  leader: Card;
  chars: Card[];
  stage: Card | null;
  hand: Card[];
  deck: Card[];
  life: Card[];
  trash: Card[];
  don: { active: number; rested: number };
  donMax: number;
  turnsTaken: number;
  denyBlock?: boolean;
  agent?: 'puct' | string;
  [k: string]: any;
}

export interface PromptOption {
  t: string;
  v: any;
  card?: { no: string; sub?: string };
  primary?: boolean;
  ghost?: boolean;
  disabled?: boolean;
}

export interface PromptConfig {
  title?: string;
  text?: string;
  opts?: PromptOption[];
  onPick?: (v: any) => void;
  cls?: string;
  side?: Side;     // この選択の決定者の席（オンライン対戦: 相手席なら「選択待ち」表示・応答は中継で解決）
  local?: boolean; // ローカル専用の確認（誤タップ救済等）。対戦相手へ中継しない
}

// G（描画に使う範囲のみ。残りは any で吸収）
export interface GameState {
  players: { me: Player; cpu: Player };
  active: Side;
  firstPlayer?: Side;
  busy: boolean;
  myActable: boolean;
  winner: Side | null;
  turnSeq: number;
  turnDisp?: number;
  inGame?: boolean;
  attackSel: { attacker: Card } | null;
  pendingChoice: {
    uids: Set<number>;
    optional?: boolean;
    danger?: boolean;
    res: (card: Card | null) => void;
  } | null;
  promptState: PromptConfig | null;
  _atkFrom?: number | null;
  _atkTo?: number | null;
  _sim?: boolean;
  aiOn?: boolean;
  cpuStrength?: 'normal' | 'strong';
  firstPref?: 'random' | 'me' | 'cpu';
  sel?: { me?: string; cpu?: string };
  names?: { me?: string; cpu?: string } | null; // オンライン対戦の表示名（sideName が参照。ハッシュ対象外）
  customDecks?: any[];
  log?: Array<{ cls: string; html: string }>;
  [k: string]: any;
}

// 組み込みデッキ（DECKS 要素）。実フィールドは src/00-data.js DECKS 準拠。
export interface Deck {
  id: string;
  name: string;
  leader: string;
  colors?: string[];
  color?: string[];
  tier?: string;
  usage?: string;
  style?: string;
  desc?: string;
  list?: Record<string, number>;
  cards?: any;
  custom?: boolean;
  [k: string]: any;
}

// ---- store に積む演出/選択の実体 ----
export interface PromptState extends PromptConfig {
  id: number;
}

export interface PickState {
  id: number;
  uids: Set<number>;
  optional?: boolean;
  danger?: boolean;
  text?: string;
  side?: Side; // この対象選択の決定者の席（オンライン対戦の席ガード用）
  resolve: (card: Card | null) => void;
}

export type FxEvent =
  | { type: 'toast'; id: number; text: string }
  | { type: 'float'; id: number; uid: number; text: string; kind?: string }
  | { type: 'anim'; id: number; uid: number; cls: string }
  | { type: 'fxnote'; id: number; side: Side; label: string; name: string; no?: string }
  | { type: 'banner'; id: number; text: string; cls: 'mine' | 'opp' }
  | { type: 'sumcut'; id: number; no: string; name: string } // 主役級（SEC/SP）登場ミニカットイン
  | { type: 'reveal'; id: number; side: Side; no: string; name: string; label: string; kind?: 'hand' | 'event' }; // 公開カードの大写し（hand=サーチで手札に／event=イベント・カウンター発動＝大型カットイン）

// ライフから公開されたトリガーカードの大写し演出（TriggerReveal オーバーレイ）。
export interface TriggerRevealState {
  side: Side;   // 被弾側（このライフの持ち主）
  no: string;   // カードID（画像用）
  name: string;
}

export interface AtkState {
  aSide: Side;
  attacker: Card;
  target: Card;
  phase: 'declare' | 'block' | 'damage';
}

export interface EndState {
  win: boolean;
  reason?: string;
}

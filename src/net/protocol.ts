// オンライン対戦（ロックステップ中継）のプロトコル定義。web ⇄ realtime Worker の単一ソース。
// realtime/ からも相対 import されるため、web 依存（React/zustand）をここに持ち込まないこと。

export type Seat = 'me' | 'cpu'; // エンジン上の席。オンラインでは me=ホスト / cpu=ゲスト に正準化（両クライアントで同一G）
export type RoomSeat = 'host' | 'guest'; // DO（部屋）上の席
export type RoomStatus = 'lobby' | 'playing' | 'ended';

export const seatOf = (rs: RoomSeat): Seat => (rs === 'host' ? 'me' : 'cpu');
export const roomSeatOf = (s: Seat): RoomSeat => (s === 'me' ? 'host' : 'guest');

// ロックステップで中継する対戦入力。DO は d を解釈せず、seq を振って全員へ配るだけ。
// 全操作をこの7種で被覆する（メニュー内の枚数選択・ブロッカー・カウンター・マリガン・
// トリガー確認などは全て 'prompt' の応答値として流れる＝値は既存のエンジン語彙そのまま）。
export type GameInput =
  | { t: 'play'; uid: number; cid?: number }              // tryPlayHand(findCard(uid))
  | { t: 'menu'; uid: number; cid?: number }              // openOwnMenu(findCard(uid))
  | { t: 'prompt'; v: any; cid?: number }                 // 開いているプロンプト/対象選択を v で解決
  | { t: 'attack'; auid: number; tuid: number; cid?: number } // declareAttack
  | { t: 'cancelAtk'; cid?: number }                      // cancelAttackSel
  | { t: 'endTurn'; cid?: number }                        // uiEndTurn(seat)
  | { t: 'forfeit'; cid?: number };                       // lose(seat,'投了')。待ち合致不要で即適用

export interface DeckPayload { leader: string; list: Record<string, number>; name: string }
export interface PlayerInfo { seat: RoomSeat; name: string; ready: boolean; connected: boolean }

export interface SeqInput { seq: number; seat: RoomSeat; d: GameInput }

// クライアント → DO
export type C2S =
  | { t: 'ready'; deck: DeckPayload }
  | { t: 'unready' }
  | { t: 'input'; d: GameInput }
  | { t: 'hash'; n: number; h: string }        // n=endTurn適用回数（ターン境界カウンタ）
  | { t: 'resume'; afterSeq: number }          // 再接続: afterSeq より後の入力を要求
  | { t: 'rematch' }
  | { t: 'leave' };

// DO → クライアント
export type S2C =
  | { t: 'joined'; seat: RoomSeat; code: string; players: PlayerInfo[]; status: RoomStatus; gameNo: number }
  | { t: 'peer'; players: PlayerInfo[] }
  | { t: 'start'; gameNo: number; seed: number; decks: Record<RoomSeat, DeckPayload>; names: Record<RoomSeat, string>; firstSeq: number }
  | { t: 'input'; seq: number; seat: RoomSeat; d: GameInput }
  | { t: 'welcome'; gameNo: number; seed: number; decks: Record<RoomSeat, DeckPayload>; names: Record<RoomSeat, string>; inputs: SeqInput[]; lastSeq: number; status: RoomStatus }
  | { t: 'desync'; n: number }
  | { t: 'rematch-wait'; by: RoomSeat }
  | { t: 'bye'; reason: 'ttl' | 'closed' | 'left' }
  | { t: 'pong' }
  | { t: 'error'; code: 'not_found' | 'room_full' | 'bad_token' | 'expired' | 'same_user' | 'rate' | 'bad_state'; msg?: string };

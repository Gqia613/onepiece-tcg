// オンライン対戦（ロックステップ中継）のプロトコル定義。web ⇄ realtime Worker の単一ソース。
// realtime/ からも相対 import されるため、web 依存（React/zustand）をここに持ち込まないこと。

export type Seat = 'me' | 'cpu'; // エンジン上の席。オンラインでは me=ホスト / cpu=ゲスト に正準化（両クライアントで同一G）
export type RoomSeat = 'host' | 'guest'; // DO（部屋）上の席
export type RoomStatus = 'lobby' | 'playing' | 'ended';

export const seatOf = (rs: RoomSeat): Seat => (rs === 'host' ? 'me' : 'cpu');
export const roomSeatOf = (s: Seat): RoomSeat => (s === 'me' ? 'host' : 'guest');

// ロックステップで中継する対戦入力。DO は d を解釈せず、seq を振って全員へ配るだけ
// （例外: forfeit/timeup は DO も終局把握のために種別だけ読む）。
// 全操作をこの語彙で被覆する（メニュー内の枚数選択・ブロッカー・カウンター・マリガン・
// トリガー確認などは全て 'prompt' の応答値として流れる＝値は既存のエンジン語彙そのまま）。
export type GameInput =
  | { t: 'play'; uid: number; cid?: number }              // tryPlayHand(findCard(uid))
  | { t: 'menu'; uid: number; cid?: number }              // openOwnMenu(findCard(uid))
  | { t: 'prompt'; v: any; cid?: number }                 // 開いているプロンプト/対象選択を v で解決
  | { t: 'attack'; auid: number; tuid: number; cid?: number } // declareAttack
  | { t: 'cancelAtk'; cid?: number }                      // cancelAttackSel
  | { t: 'endTurn'; cid?: number }                        // uiEndTurn(seat)
  | { t: 'forfeit'; reason?: string; cid?: number }       // lose(seat, reason||'投了')。待ち合致不要で即適用
  | { t: 'timeup'; cid?: number };                        // 公式風モードの時間切れ＝両者敗北（引き分け終了）

// 部屋設定（ホストがロビーで設定 → start に同梱され両クライアントで同値）
export interface ClockConfig {
  mode: 'none' | 'official30' | 'per' | 'perTurn';
  // official30: 対戦全体30分・時間切れ両者敗北（公式フロアルール準拠）
  // per:        各プレイヤー持ち時間 perMin 分（チェスクロック・切れ負け）
  // perTurn:    per に加えて1手 turnSec 秒の上限（超過も切れ負け）
  perMin?: number;   // 既定30
  turnSec?: number;  // 既定90
}
export interface RoomConfig {
  clock: ClockConfig;
  firstTurn: 'random' | 'host' | 'guest' | 'alt'; // alt=交互（gameNo奇数=host先攻）
}
export const DEFAULT_CONFIG: RoomConfig = { clock: { mode: 'none' }, firstTurn: 'random' };

// 定型エモート（自由入力はしない）
export const EMOTES = ['よろしく！', 'ナイス！', '考え中…', 'しまった！', 'すごい！', 'ありがとう', 'もう一回！', 'GG！'] as const;

export interface DeckPayload { leader: string; list: Record<string, number>; name: string }
export interface PlayerInfo { seat: RoomSeat; name: string; ready: boolean; connected: boolean }

export interface SeqInput { seq: number; seat: RoomSeat; d: GameInput; ts?: number }

// 対戦結果（両クライアントがロックステップ状態から同一に算出して申告→DOが一致確認しD1へ記録）
export interface MatchResult {
  winner: RoomSeat | 'draw';
  reason: string;
  turns: number;
}

// クライアント → DO
export type C2S =
  | { t: 'ready'; deck: DeckPayload; ver?: string }      // ver=ビルドID（両者不一致なら開始しない）
  | { t: 'unready' }
  | { t: 'config'; config: RoomConfig }                  // ホストのみ（ロビー中）
  | { t: 'input'; d: GameInput }
  | { t: 'hash'; n: number; h: string }                  // n=endTurn適用回数（ターン境界カウンタ）
  | { t: 'dump'; n: number; state: string }              // desync時のデバッグ: 境界時点の正準JSON
  | { t: 'resume'; afterSeq: number }                    // 再接続: afterSeq より後の入力を要求
  | { t: 'claim'; reason: 'disconnect' }                 // 相手切断が猶予を超えた→DOが検証し切断側の投了を代理発行
  | { t: 'emote'; k: number }                            // EMOTES のインデックス
  | { t: 'result'; result: MatchResult }                 // 終局申告（両者一致でD1記録）
  | { t: 'resync' }                                      // desync自動復旧: ログ再構築完了の申告
  | { t: 'rematch' }                                     // 同じデッキで即再戦（両者が押したら開始。旧クライアント互換のため温存）
  | { t: 'to-lobby' }                                   // ★終局後に部屋（ロビー）へ戻る＝デッキ・対戦設定を選び直す。片方が押せば両者が戻る
  | { t: 'leave' };

// DO → クライアント
export type S2C =
  | { t: 'joined'; seat: RoomSeat; code: string; players: PlayerInfo[]; status: RoomStatus; gameNo: number; config: RoomConfig; ver?: string }
  | { t: 'peer'; players: PlayerInfo[]; ts: number }
  | { t: 'config'; config: RoomConfig }
  | { t: 'version-mismatch'; vers: Record<RoomSeat, string> } // ready突合で不一致（両者readyは解除される）
  | { t: 'start'; gameNo: number; seed: number; decks: Record<RoomSeat, DeckPayload>; names: Record<RoomSeat, string>; firstSeq: number; config: RoomConfig; first: RoomSeat | null; ts: number }
  | { t: 'input'; seq: number; seat: RoomSeat; d: GameInput; ts: number }
  | { t: 'welcome'; gameNo: number; seed: number; decks: Record<RoomSeat, DeckPayload>; names: Record<RoomSeat, string>; inputs: SeqInput[]; lastSeq: number; status: RoomStatus; config: RoomConfig; first: RoomSeat | null; ts: number; startTs: number }
  | { t: 'desync'; n: number }
  | { t: 'resync-go'; lastSeq: number }                  // 両者の再構築完了→hash台帳リセット済み・続行してよい
  | { t: 'emote'; seat: RoomSeat; k: number }
  | { t: 'result-saved'; id: number | null }
  | { t: 'rematch-wait'; by: RoomSeat }
  // 部屋（ロビー）へ戻った。ready は解除済み＝両者ともデッキ選択からやり直す。last=直前の対戦結果（記録済みのもののみ）
  | { t: 'lobby'; gameNo: number; config: RoomConfig; players: PlayerInfo[]; last: MatchResult | null }
  | { t: 'bye'; reason: 'ttl' | 'closed' | 'left' }
  | { t: 'pong' }
  | { t: 'error'; code: 'not_found' | 'room_full' | 'bad_token' | 'expired' | 'same_user' | 'rate' | 'bad_state' | 'claim_rejected'; msg?: string };

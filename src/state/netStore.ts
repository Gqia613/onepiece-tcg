// オンライン対戦のネットワーク側状態（zustand）。
// ★エンジンの G にネット状態を混ぜない（ロックステップの状態ハッシュを汚染しないため）。
// mySeat は「ローカルプレイヤーがエンジン上のどちらの席か」（オフライン/ホスト='me'・ゲスト='cpu'）。
// 盤面コンポーネントの視点反転（自席=画面下段）は全て mySeat 基準で行う。
import { create } from 'zustand';
import type { Seat, PlayerInfo, RoomConfig, MatchResult } from '../net/protocol';
import { DEFAULT_CONFIG } from '../net/protocol';

export type ConnState = 'idle' | 'connecting' | 'ok' | 'reconnecting' | 'closed';
export type NetPhase = 'idle' | 'lobby' | 'playing' | 'ended';

interface NetStore {
  mode: 'offline' | 'online';
  mySeat: Seat;                 // 既定 'me'（オフライン完全後方互換）
  phase: NetPhase;
  roomCode: string | null;
  players: PlayerInfo[];
  names: { me: string; cpu: string } | null; // 席→表示名（オンライン時のみ）
  conn: ConnState;
  sending: boolean;             // 自入力のecho待ち（多重送信・多重クリックのUIロック）
  desync: boolean;              // 同期エラー検出（対戦続行不可）
  oppConnected: boolean;
  // マリガン同時化: エンジンは cpu席→me席 の順に逐次で聞く（決定論）。ホスト(me席)は相手の
  // 選択中に自分の判断を先行入力でき、自分の番が来たら自動送信される。null=未選択。
  earlyMulligan: boolean | null;
  config: RoomConfig;              // 部屋設定（ホストが設定・startで確定配布）
  verMismatch: boolean;            // クライアント版数不一致（リロード案内）
  recovering: boolean;             // desync自動復旧中（ログ再構築）
  oppLostAt: number | null;        // 相手の接続が切れた時刻（勝利宣言ボタンの表示判断・ローカル時計）
  lastEmote: { seat: Seat; k: number; id: number } | null; // 受信エモート（バブル表示用）
  replayActive: boolean;           // リプレイ再生中（操作を無効化）
  lastResult: MatchResult | null;  // 直前の対戦結果（ロビーへ戻ったときに「前局の結果」として出す）
  myDeckId: string | null;         // 直近で ready したデッキ（ロビー復帰時の既定選択）
  lobbyEpoch: number;              // ロビーへ戻るたびに++。OnlineLobby のローカルstate（readySent等）を初期化するトリガ
  lobbyNak: number;                // 「部屋に戻る」がDOに拒否された(bad_state)たびに++。EndScreenがボタンを押し直せる状態に戻すトリガ
  setMode: (m: NetStore['mode']) => void;
  setMySeat: (s: Seat) => void;
  setPhase: (p: NetPhase) => void;
  setRoomCode: (c: string | null) => void;
  setPlayers: (p: PlayerInfo[]) => void;
  setNames: (n: NetStore['names']) => void;
  setConn: (c: ConnState) => void;
  setSending: (b: boolean) => void;
  setDesync: (b: boolean) => void;
  setOppConnected: (b: boolean) => void;
  setEarlyMulligan: (v: boolean | null) => void;
  setConfig: (c: RoomConfig) => void;
  setVerMismatch: (b: boolean) => void;
  setRecovering: (b: boolean) => void;
  setOppLostAt: (t: number | null) => void;
  setLastEmote: (e: NetStore['lastEmote']) => void;
  setReplayActive: (b: boolean) => void;
  setLastResult: (r: MatchResult | null) => void;
  setMyDeckId: (id: string | null) => void;
  bumpLobbyEpoch: () => void;
  bumpLobbyNak: () => void;
  resetNet: () => void;         // オフライン既定へ戻す（対戦終了/退室時）
}

const DEFAULTS = {
  mode: 'offline' as const,
  mySeat: 'me' as Seat,
  phase: 'idle' as NetPhase,
  roomCode: null,
  players: [] as PlayerInfo[],
  names: null,
  conn: 'idle' as ConnState,
  sending: false,
  desync: false,
  oppConnected: false,
  earlyMulligan: null as boolean | null,
  config: DEFAULT_CONFIG as RoomConfig,
  verMismatch: false,
  recovering: false,
  oppLostAt: null as number | null,
  lastEmote: null as NetStore['lastEmote'],
  replayActive: false,
  // ★myDeckId / lobbyEpoch は resetNet（退室）でも初期化する。lastResult は前局の結果表示用。
  lastResult: null as MatchResult | null,
  myDeckId: null as string | null,
  lobbyEpoch: 0,
  lobbyNak: 0,
};

export const useNetStore = create<NetStore>((set) => ({
  ...DEFAULTS,
  setMode: (mode) => set({ mode }),
  setMySeat: (mySeat) => set({ mySeat }),
  setPhase: (phase) => set({ phase }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setPlayers: (players) => set({ players }),
  setNames: (names) => set({ names }),
  setConn: (conn) => set({ conn }),
  setSending: (sending) => set({ sending }),
  setDesync: (desync) => set({ desync }),
  setOppConnected: (oppConnected) => set({ oppConnected }),
  setEarlyMulligan: (earlyMulligan) => set({ earlyMulligan }),
  setConfig: (config) => set({ config }),
  setVerMismatch: (verMismatch) => set({ verMismatch }),
  setRecovering: (recovering) => set({ recovering }),
  setOppLostAt: (oppLostAt) => set({ oppLostAt }),
  setLastEmote: (lastEmote) => set({ lastEmote }),
  setReplayActive: (replayActive) => set({ replayActive }),
  setLastResult: (lastResult) => set({ lastResult }),
  setMyDeckId: (myDeckId) => set({ myDeckId }),
  bumpLobbyEpoch: () => set((s) => ({ lobbyEpoch: s.lobbyEpoch + 1 })),
  bumpLobbyNak: () => set((s) => ({ lobbyNak: s.lobbyNak + 1 })),
  resetNet: () => set({ ...DEFAULTS }),
}));

// 席の表示名（'あなた' / 相手名 / 'CPU'）。ログ・モーダル・演出ラベルの共通化。
export function seatLabel(side: Seat): string {
  const s = useNetStore.getState();
  if (side === s.mySeat) return 'あなた';
  if (s.mode === 'online' || s.replayActive) return (s.names && s.names[side]) || '相手';
  return 'CPU';
}

// オンライン対戦のネットワーク側状態（zustand）。
// ★エンジンの G にネット状態を混ぜない（ロックステップの状態ハッシュを汚染しないため）。
// mySeat は「ローカルプレイヤーがエンジン上のどちらの席か」（オフライン/ホスト='me'・ゲスト='cpu'）。
// 盤面コンポーネントの視点反転（自席=画面下段）は全て mySeat 基準で行う。
import { create } from 'zustand';
import type { Seat, PlayerInfo } from '../net/protocol';

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
  resetNet: () => set({ ...DEFAULTS }),
}));

// 席の表示名（'あなた' / 相手名 / 'CPU'）。ログ・モーダル・演出ラベルの共通化。
export function seatLabel(side: Seat): string {
  const s = useNetStore.getState();
  if (side === s.mySeat) return 'あなた';
  if (s.mode === 'online') return (s.names && s.names[side]) || '相手';
  return 'CPU';
}

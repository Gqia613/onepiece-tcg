// リプレイ再生。戦績に保存された {seed, decks, names, first, inputs} から対戦を再構築し、
// 実際の対戦と同じロックステップ機構（createLockstep）で入力を時系列再生する。
// 再生中は操作を無効化（netStore.replayActive）し、プロンプトUIも出さない（応答はログが自動供給）。
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import { createLockstep, type Lockstep } from './dispatch';
import { seatOf, type SeqInput, type DeckPayload, type RoomSeat, type RoomConfig } from './protocol';

export interface ReplayData {
  seed: number;
  decks: Record<RoomSeat, DeckPayload>;
  names: Record<RoomSeat, string>;
  first: RoomSeat | null;
  config?: RoomConfig;
  inputs: SeqInput[];
}

interface ReplayState {
  active: boolean;
  paused: boolean;
  speed: 1 | 2 | 4;
  idx: number;
  total: number;
  done: boolean;
}
import { create } from 'zustand';
export const useReplayStore = create<ReplayState>(() => ({ active: false, paused: false, speed: 1, idx: 0, total: 0, done: false }));

let driver: Lockstep | null = null;
let data: ReplayData | null = null;
let feedTimer: ReturnType<typeof setTimeout> | null = null;
let pumpTimer: ReturnType<typeof setInterval> | null = null;
let sending = false, desync = false; // driver依存のダミー

function bootReplayEngine(d: ReplayData): void {
  const es = useEngineStore.getState();
  const eng = es.resetEngine();
  eng.G.names = { me: d.names.host || 'ホスト', cpu: d.names.guest || 'ゲスト' };
  const reg = (p: DeckPayload, id: string) => eng.builderToDeck({ leaderNo: p.leader, list: p.list, name: p.name }, id);
  eng.G.customDecks = [
    ...(eng.G.customDecks || []).filter((x: any) => x.id !== 'net-host' && x.id !== 'net-guest'),
    reg(d.decks.host, 'net-host'),
    reg(d.decks.guest, 'net-guest'),
  ];
  eng.G.aiOn = false;
  eng.G.firstPref = d.first == null ? 'random' : d.first === 'host' ? 'me' : 'cpu';
  eng.seedRng(d.seed);
  void eng.startGame('net-host', 'net-guest', { cpuHuman: true });
  es.bump();
}

// viewerSeat: 'host'|'guest' — 視点（自分が参加した側を下段に）
export function startReplay(d: ReplayData, viewerSeat: RoomSeat): void {
  stopReplay(false);
  data = d;
  const net = useNetStore.getState();
  net.setReplayActive(true);
  net.setNames({ me: d.names.host || 'ホスト', cpu: d.names.guest || 'ゲスト' });
  net.setMySeat(seatOf(viewerSeat));
  bootReplayEngine(d);
  driver = createLockstep({
    engine: () => useEngineStore.getState().engine,
    prompt: () => useEngineStore.getState().prompt as any,
    bump: () => useEngineStore.getState().bump(),
    mySeat: () => 'me',
    online: () => true, // 適用時に busy 窓を張る（実対戦と同じ経路）
    sending: { get: () => sending, set: (b) => { sending = b; } },
    desync: { get: () => desync, set: (b) => { desync = b; } },
    stallMs: 600000, echoTimeoutMs: 600000,
  });
  useReplayStore.setState({ active: true, paused: false, speed: 1, idx: 0, total: d.inputs.length, done: false });
  pumpTimer = setInterval(() => driver?.pump(), 200);
  scheduleNext(600);
}

function scheduleNext(delayMs: number): void {
  if (feedTimer) clearTimeout(feedTimer);
  feedTimer = setTimeout(feedOne, delayMs);
}

function feedOne(): void {
  feedTimer = null;
  const st = useReplayStore.getState();
  if (!st.active || !driver || !data) return;
  if (st.paused) { scheduleNext(200); return; }
  const i = st.idx;
  if (i >= data.inputs.length) { finish(); return; }
  const rec = data.inputs[i];
  driver.onRemoteInput(rec.seq, seatOf(rec.seat), rec.d);
  useReplayStore.setState({ idx: i + 1 });
  const next = data.inputs[i + 1];
  if (!next) { scheduleNext(800); return; }
  // 実対戦の間隔（サーバts）を尊重しつつ 0.2〜4 秒に丸め、再生速度で割る
  const gap = rec.ts && next.ts ? next.ts - rec.ts : 800;
  const delay = Math.min(4000, Math.max(200, gap)) / useReplayStore.getState().speed;
  scheduleNext(delay);
}

function finish(): void {
  useReplayStore.setState({ done: true, paused: true });
}

export function replayTogglePause(): void {
  const st = useReplayStore.getState();
  if (st.done) return;
  useReplayStore.setState({ paused: !st.paused });
}
export function replaySetSpeed(s: 1 | 2 | 4): void {
  useReplayStore.setState({ speed: s });
}
// 残りを一気に消化（結末へスキップ）
export function replaySkipToEnd(): void {
  const st = useReplayStore.getState();
  if (!driver || !data || st.done) return;
  if (feedTimer) { clearTimeout(feedTimer); feedTimer = null; }
  const eng = useEngineStore.getState().engine!;
  eng.G._sim = true;
  for (let i = st.idx; i < data.inputs.length; i++) {
    const rec = data.inputs[i];
    driver.onRemoteInput(rec.seq, seatOf(rec.seat), rec.d);
  }
  useReplayStore.setState({ idx: data.inputs.length });
  const started = Date.now();
  const poll = () => {
    const done = driver!.nextSeq() > (data!.inputs.length ? data!.inputs[data!.inputs.length - 1].seq : 0);
    if (done || Date.now() - started > 20000) {
      eng.G._sim = false;
      if (eng.G.winner) {
        eng.G.phase = '終了';
        useEngineStore.getState().setEnd({ win: eng.G.winner === useNetStore.getState().mySeat, reason: undefined });
      }
      useEngineStore.getState().bump();
      finish();
      return;
    }
    setTimeout(poll, 120);
  };
  setTimeout(poll, 120);
}

export function stopReplay(resetBoard = true): void {
  if (feedTimer) { clearTimeout(feedTimer); feedTimer = null; }
  if (pumpTimer) { clearInterval(pumpTimer); pumpTimer = null; }
  driver = null;
  data = null;
  useReplayStore.setState({ active: false, paused: false, speed: 1, idx: 0, total: 0, done: false });
  const net = useNetStore.getState();
  net.setReplayActive(false);
  net.setMySeat('me');
  if (resetBoard) {
    const es = useEngineStore.getState();
    try { es.engine?.backToSelect?.(); } catch { /* ignore */ }
    es.setEnd(null);
    es.bump();
  }
}

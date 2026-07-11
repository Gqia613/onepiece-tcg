// オンライン対戦の持ち時間（チェスクロック）。
//
// 時計の正はサーバ（DO）が各入力に付ける ts。両クライアントが同じ ts 列から同じ消費を
// 計算するため表示が一致し、G には一切書かない（＝状態hashを汚さない）。
//
// 帰属規則（シンプルで正確）: 「入力kと入力k+1の間の時間は、入力k+1を送った席の消費」。
// 手番側の操作も、防御側のプロンプト応答も、次に行動した者＝考えていた者に一致する。
// 表示のライブ加算は「いま行動すべき席」（プロンプトの決定席 or アクティブ席）に乗せる。
//
// 執行:
// - per/perTurn: 自分の残り時間（または1手時間）が切れたら自クライアントが
//   {t:'forfeit', reason:'時間切れ'} を送る（切れ負け）。相手が切断していて自爆できない場合は
//   claim（切断裁定）が受け皿になる。
// - official30: 対戦全体の共有時計。切れたらどちらかが {t:'timeup'} を送り両者敗北（公式準拠）。
import { create } from 'zustand';
import type { ClockConfig, Seat } from './protocol';
import { uiDispatch } from './dispatch';
import { useNetStore } from '../state/netStore';
import { useEngineStore } from '../state/engineStore';

interface ClockView {
  enabled: boolean;
  mode: ClockConfig['mode'];
  remain: { me: number; cpu: number } | null; // per/perTurn: 各席の残りms
  shared: number | null;                       // official30: 共有残りms
  turnRemain: number | null;                   // perTurn: 現在の行動席の1手残りms
  owner: Seat | null;                          // いま時間を消費している席（表示用）
}

export const useClockStore = create<ClockView>(() => ({
  enabled: false, mode: 'none', remain: null, shared: null, turnRemain: null, owner: null,
}));

let cfg: ClockConfig = { mode: 'none' };
let perMs = 0;
let turnMs = 0;
let epochTs = 0;            // ゲーム開始のサーバ時刻
let lastTs = 0;             // 直近イベント（開始 or 入力）のサーバ時刻
let serverOffset = 0;       // serverTs - localWall（概算。表示とローカル執行にのみ使用）
let elapsed: { me: number; cpu: number } = { me: 0, cpu: 0 };
let timer: ReturnType<typeof setInterval> | null = null;
let myForfeitSent = false;
let timeupSent = false;

const nowServer = () => Date.now() + serverOffset;

// いま行動すべき席（ライブ表示の帰属先）。プロンプトの決定席＞アクティブ席。
function liveOwner(): Seat | null {
  const st = useEngineStore.getState();
  const eng = st.engine;
  if (!eng?.G?.inGame || eng.G.winner) return null;
  const p = st.prompt as any;
  if (p && !p.local) return (p.side as Seat) || 'me';
  return (eng.G.active as Seat) || null;
}

export function clockReset(config: ClockConfig, startTs: number, localReceiptWall: number): void {
  cfg = config || { mode: 'none' };
  perMs = (cfg.perMin ?? 30) * 60_000;
  turnMs = (cfg.turnSec ?? 90) * 1000;
  epochTs = startTs;
  lastTs = startTs;
  serverOffset = startTs - localReceiptWall;
  elapsed = { me: 0, cpu: 0 };
  myForfeitSent = false;
  timeupSent = false;
  if (timer) { clearInterval(timer); timer = null; }
  const enabled = cfg.mode !== 'none';
  useClockStore.setState({ enabled, mode: cfg.mode, remain: null, shared: null, turnRemain: null, owner: null });
  if (enabled) timer = setInterval(tick, 500);
  tick();
}

// 入力（開始以降の全操作）のサーバ時刻を記録。間隔は送信席に帰属。
export function clockNoteInput(seat: Seat, ts: number): void {
  if (cfg.mode === 'none' || !ts) return;
  if (ts > lastTs) {
    elapsed[seat] += ts - lastTs;
    lastTs = ts;
  }
}

export function clockStop(): void {
  if (timer) { clearInterval(timer); timer = null; }
  useClockStore.setState({ enabled: false, mode: 'none', remain: null, shared: null, turnRemain: null, owner: null });
  cfg = { mode: 'none' };
}

function tick(): void {
  if (cfg.mode === 'none') return;
  const net = useNetStore.getState();
  const playing = net.mode === 'online' && net.phase === 'playing' && !net.desync && !net.recovering;
  const eng = useEngineStore.getState().engine;
  const sim = !!eng?.G?._sim; // 復帰リプレイ中は執行しない（tsは入力列から積み上がる）
  const now = nowServer();

  if (cfg.mode === 'official30') {
    const shared = Math.max(0, 30 * 60_000 - (now - epochTs));
    useClockStore.setState({ enabled: true, mode: cfg.mode, shared, remain: null, turnRemain: null, owner: liveOwner() });
    if (playing && !sim && shared <= 0 && !timeupSent) {
      timeupSent = true;
      void uiDispatch({ t: 'timeup' }); // 両者が送っても適用側で冪等
    }
    return;
  }

  // per / perTurn（チェスクロック）
  const owner = liveOwner();
  const live = (s: Seat) => elapsed[s] + (owner === s && playing ? Math.max(0, now - lastTs) : 0);
  const remain = { me: Math.max(0, perMs - live('me')), cpu: Math.max(0, perMs - live('cpu')) };
  const turnRemain = cfg.mode === 'perTurn' && owner ? Math.max(0, turnMs - Math.max(0, now - lastTs)) : null;
  useClockStore.setState({ enabled: true, mode: cfg.mode, remain, shared: null, turnRemain, owner });

  if (!playing || sim || myForfeitSent) return;
  const mySeat = net.mySeat;
  const myOut = remain[mySeat] <= 0 || (cfg.mode === 'perTurn' && owner === mySeat && turnRemain !== null && turnRemain <= 0);
  if (myOut) {
    myForfeitSent = true;
    void uiDispatch({ t: 'forfeit', reason: '時間切れ' });
  }
}

// テスト用: 内部tick（表示更新・執行判定）を即時実行する
export function clockTickForTest(): void { tick(); }

// 表示用: mm:ss
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

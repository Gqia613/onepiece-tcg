// オンライン対戦の WebSocket トランスポート。
// - /api/match/token（cookie認証）で短命JWTと realtime のURLを取得
// - トークンは Sec-WebSocket-Protocol の第2要素で渡す（URL非残留）
// - 自動再接続（指数バックオフ）+ 欠番時の resume + 20秒ping（DOのAutoResponseが無課金で応答）
// - 受信 'input' は lockstep(onRemoteInput) へ、その他は setMatchHandler のハンドラへ転送
import type { C2S, S2C, GameInput } from './protocol';
import { seatOf } from './protocol';
import { onRemoteInput, lockstepGap, lockstepNextSeq, setSender } from './dispatch';
import { useNetStore } from '../state/netStore';

interface TokenResp { token: string; url: string }

// WebSocket 実装。ブラウザはグローバル、Node(テスト)は setWebSocketImpl で 'ws' パッケージ等を注入。
let WSImpl: any = (globalThis as any).WebSocket;
export function setWebSocketImpl(impl: any): void { WSImpl = impl; }

let ws: WebSocket | null = null;
let closedByUser = true;      // 初期状態は「切断されていて正常」
let roomCode: string | null = null;
let baseUrl: string | null = null;
let lastSeqSeen = 0;          // 受信済み最大 seq（再接続時の after パラメタ）
let curGameNo = 0;
let backoff = 1000;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let handler: ((m: S2C) => void) | null = null;
let visWired = false;

export function setMatchHandler(fn: ((m: S2C) => void) | null): void { handler = fn; }
export function setMatchGame(gameNo: number, lastSeq: number): void { curGameNo = gameNo; lastSeqSeen = lastSeq; }
export function matchRoomCode(): string | null { return roomCode; }

async function fetchToken(): Promise<TokenResp> {
  const r = await fetch('/api/match/token', { credentials: 'same-origin' });
  if (!r.ok) throw new Error(r.status === 503 ? 'realtime_unconfigured' : 'token_failed');
  return r.json();
}

// 部屋を作成してコードを返す（WS接続は別途 connectRoom で行う）
export async function createRoom(): Promise<string> {
  const { token, url } = await fetchToken();
  baseUrl = url;
  const r = await fetch(url + '/rooms', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('create_failed');
  const j = (await r.json()) as { code: string };
  return j.code;
}

function wsUrl(base: string, code: string): string {
  const u = base.replace(/^http/, 'ws');
  const q = curGameNo > 0 ? `?game=${curGameNo}&after=${lastSeqSeen}` : '';
  return `${u}/rooms/${encodeURIComponent(code)}/ws${q}`;
}

export function sendMatch(m: C2S): boolean {
  if (!ws || ws.readyState !== 1 /* OPEN */) return false;
  try { ws.send(JSON.stringify(m)); return true; } catch { return false; }
}

function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => { try { ws?.send('{"t":"ping"}'); } catch { /* ignore */ } }, 20000);
}
function stopPing(): void { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }

function wireVisibility(): void {
  if (visWired || typeof document === 'undefined') return;
  visWired = true;
  document.addEventListener('visibilitychange', () => {
    // iOS Safari はバックグラウンドで WS を破棄する。復帰時に即再接続。
    if (document.visibilityState === 'visible' && !closedByUser && (!ws || ws.readyState !== 1 /* OPEN */)) {
      void open();
    }
  });
}

async function open(): Promise<void> {
  if (!roomCode) return;
  if (ws && (ws.readyState === 1 /* OPEN */ || ws.readyState === 0 /* CONNECTING */)) return;
  const net = useNetStore.getState();
  net.setConn(net.conn === 'ok' || net.conn === 'idle' ? 'connecting' : 'reconnecting');
  let token: string, url: string;
  try { ({ token, url } = await fetchToken()); } catch { scheduleReconnect(); return; }
  baseUrl = url;
  let sock: WebSocket;
  try { sock = new WSImpl(wsUrl(url, roomCode), ['opcg', token]); } catch { scheduleReconnect(); return; }
  ws = sock;
  sock.onopen = () => {
    if (ws !== sock) return;
    backoff = 1000;
    useNetStore.getState().setConn('ok');
    setSender((d: GameInput) => { sendMatch({ t: 'input', d }); });
    startPing();
  };
  sock.onmessage = (ev) => {
    if (ws !== sock) return;
    let m: S2C;
    try { m = JSON.parse(String(ev.data)) as S2C; } catch { return; }
    if (m.t === 'pong') return;
    if (m.t === 'input') {
      if (m.seq > lastSeqSeen) lastSeqSeen = m.seq;
      onRemoteInput(m.seq, seatOf(m.seat), m.d);
      // 欠番（先の seq だけ届いた）→ 直ちに再送要求
      if (lockstepGap()) sendMatch({ t: 'resume', afterSeq: lockstepNextSeq() - 1 });
      return;
    }
    if (m.t === 'start' || m.t === 'welcome') { curGameNo = m.gameNo; lastSeqSeen = m.t === 'welcome' ? m.lastSeq : 0; }
    handler?.(m);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    stopPing();
    setSender(null);
    if (closedByUser) { useNetStore.getState().setConn('closed'); return; }
    scheduleReconnect();
  };
  sock.onerror = () => { /* onclose が後続 */ };
}

function scheduleReconnect(): void {
  if (closedByUser) return;
  useNetStore.getState().setConn('reconnecting');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => { reconnectTimer = null; void open(); }, backoff);
  backoff = Math.min(backoff * 2, 15000);
}

// 部屋に接続（部屋作成後・コード参加どちらも）。以後は自動再接続する。
export async function connectRoom(code: string): Promise<void> {
  roomCode = code.toUpperCase();
  closedByUser = false;
  curGameNo = 0; lastSeqSeen = 0;
  wireVisibility();
  await open();
}

// 明示的に退室して切断（自動再接続を止める）
export function leaveMatch(): void {
  closedByUser = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  try { sendMatch({ t: 'leave' }); } catch { /* ignore */ }
  try { ws?.close(1000, 'leave'); } catch { /* ignore */ }
  ws = null;
  stopPing();
  setSender(null);
  roomCode = null;
  useNetStore.getState().setConn('closed');
}

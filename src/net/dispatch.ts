// ロックステップの中核: 入力のディスパッチ（送信）と適用ポンプ（受信）。
//
// オフライン: dispatch(input) は即時にエンジンへ適用（従来の直接呼び出しと等価）。
// オンライン: dispatch(input) は DO へ送るだけ（エコースルー）。自分の入力も含め、
//   全入力は DO が振った seq 順に onRemoteInput → pump で適用する。これにより
//   両クライアントが「同一入力列を同一順序で」適用し、状態が一致する。
//
// 適用タイミングの安全性: エンジンは演出 sleep を挟む長い async チェーンのため、受信入力は
// キューに積み、「エンジンが該当の入力を受けられる待ち状態」に達したときだけ適用する
// （deliverable: プロンプト所有席・attackSel・メイン操作可否）。
//
// ★echo（送信ロック解除）は「適用完了」ではなく「適用開始」で解決する。
//   menu/play の適用はその中で次のプロンプト応答を await するため、完了待ちにすると
//   『自分の応答がロックで送れない』デッドロックになる。
//
// createLockstep は依存注入型（テストで2クライアントを同一プロセスに並走させるため）。
// アプリは既定インスタンス（実ストア束縛）を下の関数エクスポート経由で使う。
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import type { GameInput, Seat } from './protocol';

// テストは globalThis.setTimeout を setImmediate に差し替えるため、実時間タイマーは module 読込時に確保
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);

export interface LockstepDeps {
  engine: () => any;                                  // EngineAPI | null
  prompt: () => { id?: number; side?: Seat; local?: boolean; onPick?: (v: any) => void } | null;
  bump: () => void;
  mySeat: () => Seat;
  online: () => boolean;
  sending: { get: () => boolean; set: (b: boolean) => void };
  desync: { get: () => boolean; set: (b: boolean) => void };
  stallMs?: number;        // キュー先頭が適用不能のまま滞留→desync とみなすまで
  echoTimeoutMs?: number;  // 自入力のechoが返らない→失敗とみなすまで
}

export interface Lockstep {
  dispatch: (input: GameInput) => Promise<void>;
  onRemoteInput: (seq: number, seat: Seat, d: GameInput) => void;
  pump: () => void;
  reset: (startSeq?: number) => void;
  nextSeq: () => number;
  gap: () => boolean;
  setSender: (fn: ((d: GameInput) => void) | null) => void;
  setOnApplied: (fn: ((seat: Seat, d: GameInput) => void) | null) => void;
  // ターン境界コールバック。endTurn 適用後、次の入力を適用する「直前」に発火する。
  // deliverable ゲートが「エンジンが待ち状態で停泊している」ことを保証するため、
  // この時点の G は両クライアントで論理的に同一＝状態ハッシュの比較点として決定的。
  // n = それまでに適用された endTurn の累計（ハッシュ比較の番号）。
  setOnBoundary: (fn: ((n: number) => void) | null) => void;
}

export function createLockstep(deps: LockstepDeps): Lockstep {
  const STALL_MS = deps.stallMs ?? 10000;
  const ECHO_TIMEOUT_MS = deps.echoTimeoutMs ?? 10000;
  let cidCounter = 0;
  let nextSeq = 1; // 次に適用すべき seq
  const queue: Array<{ seq: number; seat: Seat; d: GameInput }> = [];
  const pendingEchoes: Array<{ cid: number; resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];
  let sender: ((d: GameInput) => void) | null = null;
  let onApplied: ((seat: Seat, d: GameInput) => void) | null = null;
  let onBoundary: ((n: number) => void) | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let endTurnsApplied = 0;   // 適用済み endTurn の累計（境界番号）
  let boundaryNotified = 0;  // onBoundary を発火済みの境界番号
  /* ★inflight-applyゲート（m12実バグの修正）: 直前入力の適用チェーン（attack=バトル全体・play/menu=効果解決全体・
     endTurn=ターン切替チェーン）が settle するまで、メインフェイズ入力（play/menu/endTurn）を配達しない。
     入力が事前キューされる復帰(resume)リプレイでは、エンジンの非同期チェーンに「一瞬停泊に見える過渡窓」
     （バトル残尾の busy=false 窓・beginTurn のドンフェイズ前）があり、そこへ次入力が滑り込むと
     無音no-op→以降のプロンプト応答が恒久配達不能→10秒後desyncになる。prompt/attackSel 分岐は対象外
     （親の適用が await している最中に応答を受けるのが正常系＝ここを塞ぐとデッドロック）。 */
  let inflight = 0;
  let applyEpoch = 0;

  function reset(startSeq = 1): void {
    queue.length = 0;
    nextSeq = startSeq;
    endTurnsApplied = 0;
    boundaryNotified = 0;
    inflight = 0;
    applyEpoch++;
    if (stallTimer) { realClearTimeout(stallTimer); stallTimer = null; }
    for (const p of pendingEchoes.splice(0)) { realClearTimeout(p.timer); p.reject(new Error('lockstep-reset')); }
    deps.sending.set(false);
  }

  async function dispatch(input: GameInput): Promise<void> {
    if (!deps.online()) {
      await applyInput(deps.mySeat(), input, false);
      deps.bump();
      return;
    }
    if (deps.desync.get()) return;
    if (deps.sending.get()) return; // 多重送信ガード（ボタン連打・二重クリック）
    const cid = ++cidCounter;
    const d = { ...input, cid } as GameInput;
    deps.sending.set(true);
    try {
      await new Promise<void>((resolve, reject) => {
        if (!sender) { reject(new Error('not-connected')); return; }
        const timer = realSetTimeout(() => {
          const i = pendingEchoes.findIndex((p) => p.cid === cid);
          if (i >= 0) pendingEchoes.splice(i, 1);
          reject(new Error('echo-timeout'));
        }, ECHO_TIMEOUT_MS);
        pendingEchoes.push({ cid, resolve, reject, timer });
        sender(d);
      });
    } finally {
      deps.sending.set(false);
    }
  }

  function onRemoteInput(seq: number, seat: Seat, d: GameInput): void {
    if (seq < nextSeq) return; // 適用済み（再送/重複）
    if (!queue.some((q) => q.seq === seq)) {
      queue.push({ seq, seat, d });
      queue.sort((a, b) => a.seq - b.seq);
    }
    pump();
  }

  // エンジンが入力 d（送信席 seat）を今受けられるか。
  function deliverable(seat: Seat, d: GameInput): boolean {
    const eng = deps.engine();
    if (!eng) return false;
    const G = eng.G;
    if (d.t === 'forfeit' || d.t === 'timeup') return true; // 終局系は待ち合致不要で即適用
    const prompt = deps.prompt();
    if (prompt) {
      if (prompt.local) return false; // ローカル確認中（自分の手番窓でしか開かない＝相手入力は来ない）
      return d.t === 'prompt' && ((prompt.side as Seat) || 'me') === seat;
    }
    if (G.attackSel) return (d.t === 'attack' || d.t === 'cancelAtk') && G.active === seat;
    if (G.active === seat && G.myActable && !G.busy && !G.promptState && !G.pendingChoice) {
      // ★'attack' はここで受けない: attack/cancelAtk は UI 上 attackSel が立ってからしか送信されない
      //   （interaction.ts の攻撃対象クリック）。入力が事前キューされる復帰リプレイでは、メニュー'atk'応答の
      //   継続（beginAttack→attackSel設定）より先に直前バトルの非同期尻尾が busy=false を戻した隙に
      //   attack が main 分岐から適用され、遅れて立った attackSel が残留→以降の入力が永久に配達不能になる
      //   （実リプレイで再現した実バグ）。attackSel 分岐だけに限定すれば適用順が本来の因果に揃う。
      if (inflight > 0) return false; // ★直前入力の適用チェーンが未settle＝過渡窓。settle後のpump再入で配達される
      return d.t === 'play' || d.t === 'menu' || d.t === 'endTurn';
    }
    return false;
  }

  let pumping = false;
  function pump(): void {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const head = queue[0];
        if (!head || head.seq !== nextSeq) break; // 欠番は resume（matchClient）の責務
        if (!deliverable(head.seat, head.d)) break;
        queue.shift();
        nextSeq++;
        applyAndSettle(head.seat, head.d);
        // apply の同期プレフィックスで prompt/G が変わり得る → ループ継続で次の入力を判定
      }
    } finally {
      pumping = false;
    }
    scheduleStallCheck();
  }

  function scheduleStallCheck(): void {
    if (stallTimer) { realClearTimeout(stallTimer); stallTimer = null; }
    if (!queue.length || queue[0].seq !== nextSeq) return;
    stallTimer = realSetTimeout(() => {
      stallTimer = null;
      if (queue.length && queue[0].seq === nextSeq && !deliverable(queue[0].seat, queue[0].d)) {
        deps.desync.set(true);
      } else {
        pump();
      }
    }, STALL_MS);
  }

  function resolveEcho(seat: Seat, d: GameInput): void {
    if (d.cid == null || seat !== deps.mySeat()) return;
    const i = pendingEchoes.findIndex((p) => p.cid === d.cid);
    if (i >= 0) { const p = pendingEchoes.splice(i, 1)[0]; realClearTimeout(p.timer); p.resolve(); }
  }

  function applyAndSettle(seat: Seat, d: GameInput): void {
    // ターン境界: endTurn 後、次の入力を適用する直前が「両クライアントで同一の停泊状態」＝比較点。
    // forfeit は任意タイミングで届く（停泊保証なし）ため比較点にしない。
    if (endTurnsApplied > boundaryNotified && d.t !== 'forfeit') {
      boundaryNotified = endTurnsApplied;
      try { onBoundary?.(endTurnsApplied); } catch { /* ignore */ }
    }
    let p: Promise<void>;
    const ep = applyEpoch;
    inflight++;
    try { p = applyInput(seat, d, true); }
    catch (e) { console.warn('[lockstep] 入力適用に失敗', d, e); p = Promise.resolve(); }
    if (d.t === 'endTurn') endTurnsApplied++;
    // ★適用「開始」でechoを解決＝送信ロック解除（menu/play は完了までに自分の応答を要するため）
    resolveEcho(seat, d);
    try { onApplied?.(seat, d); } catch { /* ignore */ }
    deps.bump();
    p.catch((e) => console.warn('[lockstep] 入力適用に失敗', d, e))
      .finally(() => { if (ep === applyEpoch) inflight = Math.max(0, inflight - 1); deps.bump(); pump(); });
    pump(); // 同期プレフィックス分（プロンプトが開いた等）を即判定
  }

  // 入力→エンジン呼び出し。manageBusy=true（オンライン適用）は runExclusive 相当の busy 窓を張る
  // （オフラインは interaction.ts の runExclusive が確認ゲートごと busy を管理するため false）。
  async function applyInput(seat: Seat, d: GameInput, manageBusy: boolean): Promise<void> {
    const eng = deps.engine();
    if (!eng) return;
    const G = eng.G;
    switch (d.t) {
      case 'prompt': {
        const p = deps.prompt();
        if (p && !p.local) p.onPick?.(d.v);
        return;
      }
      case 'cancelAtk': { eng.cancelAttackSel(); return; }
      case 'endTurn': { await eng.uiEndTurn(seat); return; } // ★awaitでターン切替チェーン（endTurn→beginTurn）をinflightに載せる＝次入力はドンフェイズ完了後にのみ配達
      case 'forfeit': {
        if (!G.winner && typeof eng.lose === 'function') eng.lose(seat, (d as any).reason || '投了');
        return;
      }
      case 'timeup': {
        // 公式風モードの時間切れ＝両者敗北（勝者なしで終了）。両クライアントで同一に適用（冪等）
        if (G.winner || G.phase === '終了') return;
        G.phase = '終了';
        G.myActable = false;
        G.attackSel = null;
        return;
      }
      case 'attack': {
        const a = eng.findCard ? eng.findCard(d.auid) : null;
        const t = eng.findCard ? eng.findCard(d.tuid) : null;
        if (!a || !t || a.owner !== seat) return;
        await eng.declareAttack(a, t);
        return;
      }
      case 'play':
      case 'menu': {
        const c = eng.findCard ? eng.findCard(d.uid) : null;
        if (!c || c.owner !== seat) return;
        if (d.t === 'play' && !G.players[seat].hand.includes(c)) return;
        const run = () => (d.t === 'play' ? eng.tryPlayHand(c) : eng.openOwnMenu(c));
        if (!manageBusy) { await run(); return; }
        if (G.busy) return;
        G.busy = true;
        try { await run(); } catch { /* エンジン側で処理済み */ }
        finally { G.busy = false; deps.bump(); }
        return;
      }
    }
  }

  return {
    dispatch,
    onRemoteInput,
    pump,
    reset,
    nextSeq: () => nextSeq,
    gap: () => queue.length > 0 && queue[0].seq > nextSeq,
    setSender: (fn) => { sender = fn; },
    setOnApplied: (fn) => { onApplied = fn; },
    setOnBoundary: (fn) => { onBoundary = fn; },
  };
}

// ---- アプリ既定インスタンス（実ストアに束縛）----
const driver = createLockstep({
  engine: () => useEngineStore.getState().engine,
  prompt: () => useEngineStore.getState().prompt as any,
  bump: () => useEngineStore.getState().bump(),
  mySeat: () => useNetStore.getState().mySeat,
  online: () => useNetStore.getState().mode === 'online',
  sending: { get: () => useNetStore.getState().sending, set: (b) => useNetStore.getState().setSending(b) },
  desync: { get: () => useNetStore.getState().desync, set: (b) => useNetStore.getState().setDesync(b) },
});

// UI からの唯一の入口。オフラインは即適用、オンラインは送信してエコー適用開始まで待つ。
export const uiDispatch = (input: GameInput): Promise<void> => driver.dispatch(input);
// matchClient からの受信（自分の入力のエコーを含む）
export const onRemoteInput = (seq: number, seat: Seat, d: GameInput): void => driver.onRemoteInput(seq, seat, d);
export const pump = (): void => driver.pump();
export const resetLockstep = (startSeq = 1): void => driver.reset(startSeq);
export const lockstepNextSeq = (): number => driver.nextSeq();
export const lockstepGap = (): boolean => driver.gap();
export const setSender = (fn: ((d: GameInput) => void) | null): void => driver.setSender(fn);
export const setOnApplied = (fn: ((seat: Seat, d: GameInput) => void) | null): void => driver.setOnApplied(fn);
export const setOnBoundary = (fn: ((n: number) => void) | null): void => driver.setOnBoundary(fn);

// オンライン対戦中の適用トリガ配線（エンジン状態変化→pump）。onlineGame の開始時に一度呼ぶ。
let wired = false;
export function wireLockstep(): void {
  if (wired) return;
  wired = true;
  useEngineStore.subscribe(() => { if (useNetStore.getState().mode === 'online') driver.pump(); });
  setInterval(() => { if (useNetStore.getState().mode === 'online') driver.pump(); }, 250);
}

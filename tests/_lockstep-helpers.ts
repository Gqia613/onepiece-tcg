// lockstep.test.ts / online-e2e.test.ts 共通のテストハーネス部品。
// （ファイル名を *.test.ts にしない＝vitest のテスト収集対象外）
import { createEngine } from '../src/engine/bootstrap';
import { makeReactAdapter, type AdapterStoreApi } from '../src/engine/reactAdapter';
import { createLockstep, type Lockstep } from '../src/net/dispatch';
import type { GameInput, Seat } from '../src/net/protocol';

// プロンプト自動応答（headlessAdapter と同方針。値を返すだけ＝送信は呼び出し元）
export function autoAnswer(prompt: any): any {
  const o = prompt.opts || [];
  const t = prompt.title || '';
  if (t.indexOf('マリガン') >= 0) return false;
  if (t.indexOf('カウンター') >= 0) return '__done';
  if (t.indexOf('トリガー') >= 0) return true;
  if (t.indexOf('ブロック') >= 0) return (o[0] && String(o[0].v).indexOf('blk:') === 0) ? o[0].v : '__skip';
  if (t.indexOf('ドン!!-') >= 0) return 'r';
  if (t.indexOf('ティーチ') >= 0) return (o[0] && o[0].v) || '__no';
  if (t.indexOf('ルーシー') >= 0) return false;
  const x = o.find((z: any) => z.primary) || o.find((z: any) => z.v && String(z.v).indexOf('pick:') === 0) || o[0];
  return x ? x.v : undefined;
}

// makeReactAdapter が要求する最小ストア
export function makeStore(): any {
  const state: any = {
    engine: null,
    muted: true,
    version: 0,
    prompt: null,
    pick: null,
    bump: () => { state.version++; },
    setPrompt: (p: any) => { state.prompt = p; },
    setPick: (p: any) => { state.pick = p; },
    pushFx: () => {},
    setAtk: () => {},
    setTrigger: () => {},
    setLethal: () => {},
    setEnd: () => {},
    setThinking: () => {},
    pushLog: () => {},
  };
  return state;
}

// 実エンジン + 実 reactAdapter + 実 createLockstep を束ねたテスト用クライアント。
// sendFn: 入力の送信先（FakeRoom / 実WebSocket）。null なら受信専用（リプレイ用）。
export function makeClient(seat: Seat, sendFn: ((d: GameInput) => void) | null) {
  const store = makeStore();
  const api: AdapterStoreApi = { getState: () => store };
  const ui = makeReactAdapter(api, { mySeat: () => seat });
  const engine = createEngine({ ui, timers: 'immediate', aiOn: false });
  store.engine = engine;
  let sending = false, desync = false;
  const driver: Lockstep = createLockstep({
    engine: () => engine,
    prompt: () => store.prompt,
    bump: () => store.bump(),
    mySeat: () => seat,
    online: () => true,
    sending: { get: () => sending, set: (b) => { sending = b; } },
    desync: { get: () => desync, set: (b) => { desync = b; } },
    stallMs: 120000, echoTimeoutMs: 120000,
  });
  if (sendFn) driver.setSender(sendFn);
  const c = {
    seat, store, engine, driver,
    isSending: () => sending,
    isDesynced: () => desync,
    endTurns: 0,
    hashes: [] as string[],
    answeredId: -1,
    playsThisTurn: 0,
    atksThisTurn: 0,
  };
  driver.setOnApplied((_s, d) => { if (d.t === 'endTurn') c.endTurns++; });
  // ターン境界（endTurn後・次入力の適用直前＝決定的な停泊状態）で状態ハッシュを記録
  driver.setOnBoundary(() => { c.hashes.push(engine.hashGameState()); });
  return c;
}

export type Client = ReturnType<typeof makeClient>;

// 席側クライアントの自動運転を1歩進める（人間のクリック相当を dispatch で送る）
export async function tickClient(c: Client): Promise<void> {
  if (c.isSending() || c.isDesynced()) return;
  const G = c.engine.G;
  const p = c.store.prompt;
  if (p) {
    if (!p.local && ((p.side || 'me') === c.seat) && c.answeredId !== p.id) {
      c.answeredId = p.id;
      await c.driver.dispatch({ t: 'prompt', v: autoAnswer(p) }).catch(() => { c.answeredId = -1; });
    }
    return; // 相手席のプロンプトは待つ
  }
  if (G.winner) return;
  if (G.attackSel) {
    if (G.active !== c.seat) return;
    const atk = G.attackSel.attacker;
    let tg: any[] = [];
    try { tg = c.engine.legalTargets(c.seat, atk); } catch { tg = []; }
    if (tg.length) await c.driver.dispatch({ t: 'attack', auid: atk.uid, tuid: tg[0].uid }).catch(() => {});
    else await c.driver.dispatch({ t: 'cancelAtk' }).catch(() => {});
    return;
  }
  if (G.active === c.seat && G.myActable && !G.busy && !G.promptState && !G.pendingChoice) {
    const me = G.players[c.seat];
    const playable = me.hand.find((x: any) => { try { return c.engine.handPlayable(x); } catch { return false; } });
    if (playable && c.playsThisTurn < 25) {
      c.playsThisTurn++;
      await c.driver.dispatch({ t: 'play', uid: playable.uid }).catch(() => {});
      return;
    }
    let atk: any = null;
    try {
      if (c.engine.canAttackThisTurn(c.seat)) {
        atk = [me.leader, ...me.chars].find((x: any) => {
          try { return c.engine.canCardAttack(x) && c.engine.legalTargets(c.seat, x).length > 0; } catch { return false; }
        });
      }
    } catch { /* ignore */ }
    if (atk && c.atksThisTurn < 14) {
      c.atksThisTurn++;
      await c.driver.dispatch({ t: 'menu', uid: atk.uid }).catch(() => {}); // メニューの'atk'は自動応答が選ぶ
      return;
    }
    c.playsThisTurn = 0;
    c.atksThisTurn = 0;
    await c.driver.dispatch({ t: 'endTurn' }).catch(() => {});
  }
}

export function bootClient(c: Client, seed: number, deckA: string, deckB: string): void {
  const G = c.engine.G;
  G.players = {};
  G.winner = null;
  G.inGame = false;
  G.aiOn = false;
  G.firstPref = 'random';
  c.engine.seedRng(seed);
  void c.engine.startGame(deckA, deckB);
}

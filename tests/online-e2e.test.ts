// オンライン対戦の実スタック統合テスト（E2E-lite）。
// ホスト側 = 本物のシングルトンスタック（matchClient + onlineGame + dispatch + zustandストア + 実エンジン）
// ゲスト側 = _lockstep-helpers のクライアント + 生WebSocket（'ws'パッケージ）
// を、テストが spawn する実 wrangler dev（MatchRoom DO）へ接続して1局完走させる。
// 検証: 部屋作成→join→ready→start→入力中継→ターン境界hashのDO突合（desyncしない）→勝敗一致。
//
// 実行: OPCG_E2E=1 npx vitest run tests/online-e2e.test.ts
// （wrangler の起動を含むため既定のテストスイートではスキップ）
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeClient, tickClient, autoAnswer, type Client } from './_lockstep-helpers';
import { seatOf, roomSeatOf, type DeckPayload, type S2C, type Seat } from '../src/net/protocol';
import { useEngineStore } from '../src/state/engineStore';
import { useNetStore } from '../src/state/netStore';
import { hostRoom, leaveOnline } from '../src/net/onlineGame';
import { setWebSocketImpl } from '../src/net/matchClient';
import { uiDispatch, lockstepNextSeq as lockstepNextSeqHost } from '../src/net/dispatch';
// @ts-ignore JSモジュール
import { signJWT } from '../functions/_lib/jwt.js';

const RUN = !!process.env.OPCG_E2E;
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = new URL('..', import.meta.url).pathname;

const nodeRequire = createRequire(import.meta.url);
const WS = nodeRequire('ws');

let wrangler: ChildProcess | null = null;
let SECRET = '';
let realFetch: typeof fetch;

function readSecret(): string {
  const txt = readFileSync(ROOT + 'realtime/.dev.vars', 'utf8');
  const m = /^JWT_SECRET=(.+)$/m.exec(txt);
  if (!m) throw new Error('realtime/.dev.vars に JWT_SECRET がありません');
  return m[1].trim();
}

async function waitReady(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try { const r = await realFetch(BASE + '/healthz'); if (r.ok) return; } catch { /* まだ */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('wrangler dev が起動しません');
}

(RUN ? describe : describe.skip)('オンライン対戦 実スタック統合（実DO）', () => {
  beforeAll(async () => {
    SECRET = readSecret();
    realFetch = globalThis.fetch.bind(globalThis);
    setWebSocketImpl(WS); // Node20 にはグローバル WebSocket が無いため 'ws' を注入
    wrangler = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--var', 'ALLOW_NO_ORIGIN:true'], {
      cwd: ROOT + 'realtime',
      stdio: 'ignore',
      detached: false,
    });
    await waitReady();
    // ホストの /api/match/token をモック（Pages Functions の代わりにテストが署名する）
    (globalThis as any).fetch = async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/match/token') {
        const token = await signJWT({ uid: 101, un: 'e2e-host', scope: 'match' }, SECRET, 60);
        return new Response(JSON.stringify({ token, url: BASE }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    };
  }, 90000);

  afterAll(async () => {
    (globalThis as any).fetch = realFetch;
    try { leaveOnline(); } catch { /* ignore */ }
    if (wrangler) { try { wrangler.kill('SIGTERM'); } catch { /* ignore */ } wrangler = null; }
  });

  it('部屋作成→両者join→ready→start→1局完走（DOのhash突合でdesyncなし・勝敗一致）', async () => {
    // 演出sleepの短絡はグローバルタイマー差し替えではなく G._sim（両クライアント対称・hash対象外）で行う。
    // グローバル差し替えは undici(fetch/WS) の内部タイマーを壊すため不可。
    {
      // ---- ホスト（本物のスタック）----
      useEngineStore.getState().initEngine();
      const code = await hostRoom();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      // 接続確立を待つ
      for (let i = 0; i < 200 && useNetStore.getState().conn !== 'ok'; i++) await new Promise((r) => setTimeout(r, 50));
      expect(useNetStore.getState().conn).toBe('ok');
      expect(useNetStore.getState().mySeat).toBe('me');

      // ---- ゲスト（ヘルパークライアント + 生WS）----
      const guestToken = await signJWT({ uid: 202, un: 'e2e-guest', scope: 'match' }, SECRET, 60);
      const gws = new WS(`${BASE.replace('http', 'ws')}/rooms/${code}/ws`, ['opcg', guestToken]);
      const guest: Client = makeClient('cpu', (d) => { try { gws.send(JSON.stringify({ t: 'input', d })); } catch { /* ignore */ } });
      let guestStarted = false;
      let guestSeat: Seat | null = null;
      guest.driver.setOnBoundary(() => {
        // 本番の onlineGame と同じ: 境界でhashをDOへ（突合で不一致なら desync が飛ぶ）
        try { gws.send(JSON.stringify({ t: 'hash', n: guest.endTurns, h: guest.engine.hashGameState() })); } catch { /* ignore */ }
        guest.hashes.push(guest.engine.hashGameState());
      });
      let guestDesyncMsg = false;
      gws.on('message', (buf: any) => {
        const m = JSON.parse(String(buf)) as S2C;
        if (m.t === 'joined') { guestSeat = seatOf(m.seat); return; }
        if (m.t === 'start') {
          // 本番 bootGame と同じ手順（net-host/net-guest 登録 → seedRng → startGame）
          const eng = guest.engine;
          const reg = (d: DeckPayload, id: string) => eng.builderToDeck({ leaderNo: d.leader, list: d.list, name: d.name }, id);
          eng.G.customDecks = [reg(m.decks.host, 'net-host'), reg(m.decks.guest, 'net-guest')];
          eng.G.players = {}; eng.G.winner = null; eng.G.inGame = false;
          eng.G.aiOn = false; eng.G.firstPref = 'random';
          eng.G.names = { me: m.names.host, cpu: m.names.guest };
          eng.seedRng(m.seed);
          void eng.startGame('net-host', 'net-guest', { cpuHuman: true });
          eng.G._sim = true; // 演出sleepを短絡（ホストと対称に設定＝hash対象外）
          guestStarted = true;
          return;
        }
        if (m.t === 'input') { guest.driver.onRemoteInput(m.seq, seatOf(m.seat), m.d); return; }
        if (m.t === 'desync') { guestDesyncMsg = true; return; }
      });
      await new Promise<void>((res, rej) => { gws.on('open', res); gws.on('error', rej); });
      expect(await waitFor(() => guestSeat === 'cpu')).toBe(true);

      // ---- 両者 ready（プリセットデッキ）----
      const hostEngine = useEngineStore.getState().engine!;
      const pick = (id: string): DeckPayload => {
        const d = (hostEngine.DECKS as any[]).find((x) => x.id === id);
        return { leader: d.leader, list: d.list, name: d.name };
      };
      const { sendReady } = await import('../src/net/onlineGame');
      sendReady(pick('lucy'));
      gws.send(JSON.stringify({ t: 'ready', deck: pick('enel') }));

      // start 受信（ホストは onlineGame が bootGame・ゲストは上のハンドラ）
      expect(await waitFor(() => guestStarted && useNetStore.getState().phase === 'playing', 15000)).toBe(true);
      useEngineStore.getState().engine!.G._sim = true; // ホストも演出sleepを短絡（ゲストと対称）

      // ---- ホスト側の自動運転（本物の uiDispatch / ストアを使用）----
      const hostTick = async () => {
        const net = useNetStore.getState();
        if (net.sending || net.desync) return;
        const eng = useEngineStore.getState().engine; if (!eng) return;
        const G = eng.G;
        const p = useEngineStore.getState().prompt as any;
        if (p) {
          if (!p.local && ((p.side || 'me') === 'me') && hostAnswered !== p.id) {
            hostAnswered = p.id;
            await uiDispatch({ t: 'prompt', v: autoAnswer(p) }).catch(() => { hostAnswered = -1; });
          }
          return;
        }
        if (G.winner) return;
        if (G.attackSel) {
          if (G.active !== 'me') return;
          const atk = G.attackSel.attacker;
          let tg: any[] = []; try { tg = eng.legalTargets('me', atk); } catch { /* */ }
          if (tg.length) await uiDispatch({ t: 'attack', auid: atk.uid, tuid: tg[0].uid }).catch(() => {});
          else await uiDispatch({ t: 'cancelAtk' }).catch(() => {});
          return;
        }
        if (G.active === 'me' && G.myActable && !G.busy && !G.promptState && !G.pendingChoice) {
          const me = G.players.me;
          const playable = me.hand.find((x: any) => { try { return eng.handPlayable(x); } catch { return false; } });
          if (playable && hostPlays < 25) { hostPlays++; await uiDispatch({ t: 'play', uid: playable.uid }).catch(() => {}); return; }
          let atk: any = null;
          try { if (eng.canAttackThisTurn('me')) atk = [me.leader, ...me.chars].find((x: any) => { try { return eng.canCardAttack(x) && eng.legalTargets('me', x).length > 0; } catch { return false; } }); } catch { /* */ }
          if (atk && hostAtks < 14) { hostAtks++; await uiDispatch({ t: 'menu', uid: atk.uid }).catch(() => {}); return; }
          hostPlays = 0; hostAtks = 0;
          await uiDispatch({ t: 'endTurn' }).catch(() => {});
        }
      };
      let hostAnswered = -1, hostPlays = 0, hostAtks = 0;

      // ---- 1局完走 ----
      // ★DO はソケットあたり 20msg/秒のレート制限を持つ（room.ts）。_sim 高速化した自動運転が
      //   これを超えると入力が落ち echo-timeout(10s) が積み重なって停止するため、送信を 60ms/loop に
      //   ペーシングする（実ユーザーのクリック速度では到達しない制限）。
      const deadline = Date.now() + 120000;
      let lastSeq = -1, lastProgress = Date.now();
      while (Date.now() < deadline) {
        const hg = useEngineStore.getState().engine?.G;
        if (hg?.winner && guest.engine.G.winner) break;
        if (useNetStore.getState().desync || guest.isDesynced() || guestDesyncMsg) break;
        const seqNow = lockstepNextSeqHost();
        if (seqNow !== lastSeq) { lastSeq = seqNow; lastProgress = Date.now(); }
        else if (Date.now() - lastProgress > 20000) { console.log('[diag] 20秒間進捗なしで打ち切り'); break; }
        await new Promise((r) => setTimeout(r, 60));
        guest.driver.pump();
        await hostTick();
        await tickClient(guest);
      }
      for (let i = 0; i < 50; i++) await new Promise<void>((r) => (globalThis as any).setImmediate(r));

      // 診断: 未決着ならスナップショットを出力
      {
        const hg = useEngineStore.getState().engine!.G;
        const gg = guest.engine.G;
        const hp = useEngineStore.getState().prompt as any;
        const gp = guest.store.prompt as any;
        if (!hg.winner || !gg.winner) {
          console.log('[diag] host:', JSON.stringify({
            active: hg.active, phase: hg.phase, turn: hg.turnSeq, actable: hg.myActable, busy: hg.busy,
            prompt: hp ? { title: hp.title, side: hp.side, local: hp.local } : null,
            atkSel: !!hg.attackSel, sending: useNetStore.getState().sending, nextSeq: lockstepNextSeqHost(),
          }));
          console.log('[diag] guest:', JSON.stringify({
            active: gg.active, phase: gg.phase, turn: gg.turnSeq, actable: gg.myActable, busy: gg.busy,
            prompt: gp ? { title: gp.title, side: gp.side, local: gp.local } : null,
            atkSel: !!gg.attackSel, sending: guest.isSending(), nextSeq: guest.driver.nextSeq(),
          }));
        }
      }

      const hostG = useEngineStore.getState().engine!.G;
      expect(useNetStore.getState().desync, 'ホストdesyncなし（DOのhash突合を全通過）').toBe(false);
      expect(guestDesyncMsg, 'ゲストにdesync配信なし').toBe(false);
      expect(hostG.winner, '勝敗が付いた').toBeTruthy();
      expect(hostG.winner, '勝者一致').toBe(guest.engine.G.winner);
      expect(useEngineStore.getState().engine!.hashGameState(), '最終状態hash一致').toBe(guest.engine.hashGameState());
      expect(useNetStore.getState().phase).toBe('ended');

      try { gws.close(); } catch { /* ignore */ }
    }

    async function waitFor(pred: () => boolean, ms = 8000): Promise<boolean> {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if (pred()) return true;
        await new Promise<void>((r) => (globalThis as any).setImmediate(r));
        await new Promise((r) => setTimeout(r, 20));
      }
      return pred();
    }
  }, 300000);
});

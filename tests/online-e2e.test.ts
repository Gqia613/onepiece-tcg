// オンライン対戦の実スタック統合テスト（E2E-lite）。
// ホスト側 = 本物のシングルトンスタック（matchClient + onlineGame + dispatch + zustandストア + 実エンジン）
// ゲスト側 = _lockstep-helpers のクライアント + 生WebSocket（'ws'パッケージ）
// を、テストが spawn する実 wrangler dev（MatchRoom DO）へ接続して1局完走させる。
// 検証: 部屋作成→join→ready→start→入力中継→ターン境界hashのDO突合（desyncしない）→勝敗一致。
//
// 実行: OPCG_E2E=1 npx vitest run tests/online-e2e.test.ts
// （wrangler の起動を含むため既定のテストスイートではスキップ）
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeClient, tickClient, autoAnswer, type Client } from './_lockstep-helpers';
import { seatOf, roomSeatOf, type DeckPayload, type S2C, type Seat } from '../src/net/protocol';
import { useEngineStore } from '../src/state/engineStore';
import { useNetStore } from '../src/state/netStore';
import { hostRoom, leaveOnline, sendConfig } from '../src/net/onlineGame';
import { setWebSocketImpl } from '../src/net/matchClient';
import { uiDispatch, lockstepNextSeq as lockstepNextSeqHost } from '../src/net/dispatch';
// @ts-ignore JSモジュール
import { signJWT } from '../functions/_lib/jwt.js';

declare const __BUILD_ID__: string; // vite define（vitestにも適用される）

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
    wrangler = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--var', 'ALLOW_NO_ORIGIN:true', '--var', 'CLAIM_GRACE_MS:3000'], {
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
      // 部屋設定（先攻=ホスト固定）を配布→startに反映されることを検証
      sendConfig({ clock: { mode: 'none' }, firstTurn: 'host' });
      expect(await waitFor(() => useNetStore.getState().config.firstTurn === 'host')).toBe(true);

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
          eng.G.aiOn = false;
          eng.G.firstPref = m.first == null ? 'random' : m.first === 'host' ? 'me' : 'cpu'; // 部屋設定の先攻（本番bootGameと同じ）
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
      gws.send(JSON.stringify({ t: 'ready', deck: pick('enel'), ver: __BUILD_ID__ })); // ホストと同版＝開始できる

      // start 受信（ホストは onlineGame が bootGame・ゲストは上のハンドラ）
      expect(await waitFor(() => guestStarted && useNetStore.getState().phase === 'playing', 15000)).toBe(true);
      // 先攻=ホスト設定が両エンジンに反映されている
      expect(useEngineStore.getState().engine!.G.firstPlayer).toBe('me');
      expect(await waitFor(() => guest.engine.G.firstPlayer === 'me', 5000)).toBe(true);
      useEngineStore.getState().engine!.G._sim = true; // ホストも演出sleepを短絡（ゲストと対称）
      // ★実機desyncの再現条件（部屋ZWYS97）: 本番では resetEngine 後に loadCloudDecks が
      //   ユーザーの保存デッキを builderToDeck で登録し、連番 G._customSeq が保存デッキ数ぶん
      //   クライアント間でズレる。ホスト側の新エンジンにだけ余分に2つ登録して模す
      //   （hashが連番を拾うようになったら即desyncする回帰ガード）。
      {
        const e2 = useEngineStore.getState().engine!;
        const base = pick('lucy');
        e2.G.customDecks = e2.G.customDecks || [];
        e2.G.customDecks.push(e2.builderToDeck({ leaderNo: base.leader, list: base.list, name: 'クラウド1' }, undefined as any));
        e2.G.customDecks.push(e2.builderToDeck({ leaderNo: base.leader, list: base.list, name: 'クラウド2' }, undefined as any));
      }

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
      // テスト専用の _sim 高速化を解除（本番watcherは _sim 中は動かない設計のため、ここで発火させる）
      { const hg2 = useEngineStore.getState().engine!.G; if (hg2._sim) { hg2._sim = false; useEngineStore.getState().bump(); } }
      guest.engine.G._sim = false;
      await new Promise((r) => setTimeout(r, 300));

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

      // ---- 終局申告→D1（ローカル）へ戦績＋リプレイが書かれる ----
      // ホストは watcher が自動申告済み。ゲスト（ハーネス）はここで申告して一致させる。
      const winnerRoom = hostG.winner === 'me' ? 'host' : 'guest';
      gws.send(JSON.stringify({ t: 'result', result: { winner: winnerRoom, reason: '', turns: guest.engine.G.turnDisp || 0 } }));
      let saved: any = null;
      for (let i = 0; i < 12 && !saved; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const out = execSync(
            `npx wrangler d1 execute opcg --local --json --command "SELECT winner, turns, length(replay) AS rlen FROM matches ORDER BY id DESC LIMIT 1"`,
            { cwd: ROOT + 'realtime', encoding: 'utf8' },
          );
          const rows = JSON.parse(out)?.[0]?.results || [];
          if (rows.length) saved = rows[0];
        } catch { /* まだ */ }
      }
      expect(saved, '戦績がD1に記録された').toBeTruthy();
      expect(saved.winner, '記録の勝者一致').toBe(winnerRoom);
      expect(Number(saved.rlen), 'リプレイJSONが保存された').toBeGreaterThan(1000);

      // desyncデバッグ計器の疎通: dump を預けて /rooms/:code/dump で回収できる
      const { sendMatch } = await import('../src/net/matchClient');
      sendMatch({ t: 'dump', n: 99, state: '{"probe":1}' });
      await new Promise((r) => setTimeout(r, 500));
      const dr = await realFetch(`${BASE}/rooms/${code}/dump`);
      expect(dr.status).toBe(200);
      const dj = (await dr.json()) as any;
      expect(dj.host?.state).toBe('{"probe":1}');

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

  it('プロトコル拡張: 設定配布・版数照合・emote・desync→resync調停・切断claim代理投了', async () => {
    const raw = (code: string, token: string) => {
      const ws = new WS(`${BASE.replace('http', 'ws')}/rooms/${code}/ws`, ['opcg', token]);
      const msgs: any[] = [];
      const waiters: Array<{ pred: (m: any) => boolean; res: (m: any) => void; t: any }> = [];
      ws.on('message', (b: any) => {
        const m = JSON.parse(String(b));
        msgs.push(m);
        for (let i = waiters.length - 1; i >= 0; i--) {
          const w = waiters[i];
          const hit = msgs.find(w.pred);
          if (hit) { waiters.splice(i, 1); clearTimeout(w.t); w.res(hit); }
        }
      });
      const wait = (pred: (m: any) => boolean, label: string, ms = 8000) => new Promise<any>((res, rej) => {
        const hit = msgs.find(pred);
        if (hit) return res(hit);
        const t = setTimeout(() => rej(new Error('timeout: ' + label)), ms);
        waiters.push({ pred, res, t });
      });
      const open = new Promise<void>((res, rej) => { ws.on('open', () => res()); ws.on('error', rej); });
      return { ws, msgs, wait, open, send: (m: any) => ws.send(JSON.stringify(m)) };
    };
    const deck = { leader: 'OP01-001', list: { 'OP01-016': 4 }, name: 'x' };

    const tA = await signJWT({ uid: 301, un: 'proto-a', scope: 'match' }, SECRET, 60);
    const tB = await signJWT({ uid: 302, un: 'proto-b', scope: 'match' }, SECRET, 60);
    const mk = await realFetch(BASE + '/rooms', { method: 'POST', headers: { Authorization: 'Bearer ' + tA } });
    const { code } = (await mk.json()) as any;

    const A = raw(code, tA); await A.open;
    const jA = await A.wait((m) => m.t === 'joined', 'A joined');
    expect(jA.config.clock.mode).toBe('none'); // 既定設定が配布される
    const B = raw(code, tB); await B.open;
    await B.wait((m) => m.t === 'joined', 'B joined');

    // 設定配布（サニタイズ込み）
    A.send({ t: 'config', config: { clock: { mode: 'perTurn', perMin: 20, turnSec: 60 }, firstTurn: 'alt' } });
    const cB = await B.wait((m) => m.t === 'config' && m.config.clock.mode === 'perTurn', 'Bにconfig');
    expect(cB.config.clock.perMin).toBe(20);
    expect(cB.config.clock.turnSec).toBe(60);
    expect(cB.config.firstTurn).toBe('alt');

    // 版数照合: 不一致なら開始せず両者のreadyを解除
    A.send({ t: 'ready', deck, ver: 'AAA' });
    B.send({ t: 'ready', deck, ver: 'BBB' });
    const vm = await A.wait((m) => m.t === 'version-mismatch', 'version-mismatch');
    expect(vm.vers.host).toBe('AAA');
    expect(vm.vers.guest).toBe('BBB');
    // 同版で再ready → start（alt: ゲーム1はホスト先攻・config/ts同梱）
    A.send({ t: 'ready', deck, ver: 'SAME' });
    B.send({ t: 'ready', deck, ver: 'SAME' });
    const st = await B.wait((m) => m.t === 'start', 'start');
    expect(st.first).toBe('host');
    expect(st.config.clock.mode).toBe('perTurn');
    expect(typeof st.ts).toBe('number');

    // 入力にtsが付く
    A.send({ t: 'input', d: { t: 'menu', uid: 1 } });
    const i1 = await B.wait((m) => m.t === 'input' && m.seq === 1, 'input ts');
    expect(typeof i1.ts).toBe('number');
    expect(i1.ts).toBeGreaterThan(0);

    // emote 中継
    B.send({ t: 'emote', k: 1 });
    const em = await A.wait((m) => m.t === 'emote', 'emote');
    expect(em.seat).toBe('guest');
    expect(em.k).toBe(1);

    // desync → 両者resync → resync-go（hash台帳リセット・続行可能）
    A.send({ t: 'hash', n: 1, h: 'xxx' });
    B.send({ t: 'hash', n: 1, h: 'yyy' });
    await A.wait((m) => m.t === 'desync', 'desync');
    A.send({ t: 'resync' });
    B.send({ t: 'resync' });
    const rg = await B.wait((m) => m.t === 'resync-go', 'resync-go');
    expect(rg.lastSeq).toBe(1);
    // 復旧後は入力が再び通る
    B.send({ t: 'input', d: { t: 'endTurn' } });
    await A.wait((m) => m.t === 'input' && m.seq === 2, '復旧後input');

    // 切断claim: Bが落ちて猶予(テストでは3秒)経過→Aの宣言でDOがguestの投了を代理発行
    B.ws.close();
    await new Promise((r) => setTimeout(r, 800));
    A.send({ t: 'claim', reason: 'disconnect' }); // 猶予前→拒否
    await A.wait((m) => m.t === 'error' && m.code === 'claim_rejected', '猶予前は拒否');
    await new Promise((r) => setTimeout(r, 3200));
    A.send({ t: 'claim', reason: 'disconnect' });
    const ff = await A.wait((m) => m.t === 'input' && m.d?.t === 'forfeit', '代理投了')
      .catch((e) => { console.log('[diag] claim後のA受信:', JSON.stringify(A.msgs.slice(-6))); throw e; });
    expect(ff.seat).toBe('guest');
    expect(ff.d.reason).toBe('切断');

    A.ws.close();
  }, 120000);

  /* 終局 →「部屋に戻る」(to-lobby) → デッキと先攻設定を変えて再開できる。
     ユーザー要望「もう一度でデッキ選択に戻りたい（退室して部屋を作り直すのが面倒）」の実スタック検証。
     ★ここで守っているもの:
       - ready が落ちる（落ちないと片方の準備完了で即開始してしまい、相手はデッキを変えられない）
       - gameNo は進まない（進めると firstTurn:'alt' の交互先攻がズレる）
       - 両者が同時に押しても2人目にエラーが出ない（冪等）
       - 再開時に firstSeq=1（入力ログ/採番がリセットされている）＝新しいデッキで正しく始まる */
  it('終局→「部屋に戻る」→デッキと先攻設定を変えて再開できる', async () => {
    const raw = (code: string, token: string) => {
      const ws = new WS(`${BASE.replace('http', 'ws')}/rooms/${code}/ws`, ['opcg', token]);
      const msgs: any[] = [];
      const waiters: Array<{ pred: (m: any) => boolean; res: (m: any) => void; t: any }> = [];
      ws.on('message', (b: any) => {
        const m = JSON.parse(String(b));
        msgs.push(m);
        for (let i = waiters.length - 1; i >= 0; i--) {
          const w = waiters[i];
          const hit = msgs.find(w.pred);
          if (hit) { waiters.splice(i, 1); clearTimeout(w.t); w.res(hit); }
        }
      });
      const wait = (pred: (m: any) => boolean, label: string, ms = 8000) => new Promise<any>((res, rej) => {
        const hit = msgs.find(pred);
        if (hit) return res(hit);
        const t = setTimeout(() => rej(new Error('timeout: ' + label)), ms);
        waiters.push({ pred, res, t });
      });
      const open = new Promise<void>((res, rej) => { ws.on('open', () => res()); ws.on('error', rej); });
      return { ws, msgs, wait, open, send: (m: any) => ws.send(JSON.stringify(m)) };
    };
    const deckX = { leader: 'OP01-001', list: { 'OP01-016': 4 }, name: 'X' };
    const deckY = { leader: 'OP02-001', list: { 'OP01-016': 4 }, name: 'Y' };

    const tA = await signJWT({ uid: 401, un: 'lob-a', scope: 'match' }, SECRET, 60);
    const tB = await signJWT({ uid: 402, un: 'lob-b', scope: 'match' }, SECRET, 60);
    const mk = await realFetch(BASE + '/rooms', { method: 'POST', headers: { Authorization: 'Bearer ' + tA } });
    const { code } = (await mk.json()) as any;

    const A = raw(code, tA); await A.open; await A.wait((m) => m.t === 'joined', 'A joined');
    const B = raw(code, tB); await B.open; await B.wait((m) => m.t === 'joined', 'B joined');

    // 先攻=交互（alt）にして1局目を開始（同一ver）
    A.send({ t: 'config', config: { clock: { mode: 'none' }, firstTurn: 'alt' } });
    await B.wait((m) => m.t === 'config' && m.config.firstTurn === 'alt', 'config配布');
    A.send({ t: 'ready', deck: deckX, ver: 'v1' });
    B.send({ t: 'ready', deck: deckX, ver: 'v1' });
    const st1 = await A.wait((m) => m.t === 'start', 'start1');
    expect(st1.gameNo).toBe(1);
    expect(st1.first).toBe('host');       // alt: 奇数ゲーム=host先攻
    expect(st1.firstSeq).toBe(1);

    // 終局を申告（両者一致 → D1未設定でも resultSaved になる）
    const result = { winner: 'host', reason: 'ライフ0', turns: 8 };
    A.send({ t: 'result', result });
    B.send({ t: 'result', result });
    await A.wait((m) => m.t === 'result-saved', 'result-saved');

    // ★A が「部屋に戻る」→ 両者がロビーへ（片方が押せば戻る）
    A.send({ t: 'to-lobby' });
    const lbA = await A.wait((m) => m.t === 'lobby', 'A lobby');
    const lbB = await B.wait((m) => m.t === 'lobby', 'B lobby');
    expect(lbA.gameNo).toBe(1);                                   // ★gameNo は進めない（altの交互性を保つ）
    expect(lbA.players.every((p: any) => p.ready === false)).toBe(true); // ★ready が落ちている＝デッキを選び直せる
    expect(lbB.last).toEqual(result);                             // 前局の結果は残す
    expect(lbA.config.firstTurn).toBe('alt');                     // 設定は保持

    // ★冪等: B も押す（両者同時押しは最も起きやすい）→ エラーにならず lobby が返る
    const errsBefore = B.msgs.filter((m: any) => m.t === 'error').length;
    B.send({ t: 'to-lobby' });
    await new Promise((r) => setTimeout(r, 400));
    expect(B.msgs.filter((m: any) => m.t === 'error').length).toBe(errsBefore);

    // ロビーなのでホストは設定を変えられる（status==='lobby' ゲートが復活している）
    A.send({ t: 'config', config: { clock: { mode: 'none' }, firstTurn: 'guest' } });
    await B.wait((m) => m.t === 'config' && m.config.firstTurn === 'guest', 'config再配布');

    // ★デッキを変えて再開
    A.send({ t: 'ready', deck: deckY, ver: 'v1' });
    B.send({ t: 'ready', deck: deckX, ver: 'v1' });
    const st2 = await A.wait((m) => m.t === 'start' && m.gameNo === 2, 'start2');
    expect(st2.decks.host.leader).toBe(deckY.leader); // 新しいデッキで開始
    expect(st2.first).toBe('guest');                  // 変更した設定が効く
    expect(st2.firstSeq).toBe(1);                     // 採番がリセットされている

    // 新局で入力が通る（seq が 1 から）
    A.send({ t: 'input', d: { t: 'menu', uid: 1 } });
    const in1 = await B.wait((m) => m.t === 'input' && m.seq === 1, '新局の入力');
    expect(in1.seat).toBe('host');

    A.ws.close(); B.ws.close();
  }, 120000);
});

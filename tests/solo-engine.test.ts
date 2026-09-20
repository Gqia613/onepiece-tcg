// 1人回し（solo）のエンジン統合: startGame({cpuHuman:true}) で cpu 席も人間として構築され、
// 相手のターンが CPU AI に自動処理されず「人間の操作待ち」で止まること＝両席を操作して1局回せることを検証する。
// （UI 側は mySeat を手番へ追従させるだけ＝tests/solo.test.tsx。ここはエンジン構成の担保。）
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { useEngineStore } from '../src/state/engineStore';

// reactAdapter.fxNote は globalThis.setTimeout を使うのでテスト中は即時化（高速化）。
let realST: any;
beforeAll(() => { realST = globalThis.setTimeout; (globalThis as any).setTimeout = (cb: any) => { (globalThis as any).setImmediate(cb); return 0 as any; }; });
afterAll(() => { (globalThis as any).setTimeout = realST; });

// プロンプト自動応答（react-integration.test.ts と同方針）。両席分のプロンプトが来る。
function autoAnswer(prompt: any) {
  const o = prompt.opts || [];
  const t = prompt.title || '';
  let v: any;
  if (t.indexOf('マリガン') >= 0) v = false;
  else if (t.indexOf('カウンター') >= 0) v = '__done';
  else if (t.indexOf('トリガー') >= 0) v = true;
  else if (t.indexOf('ブロック') >= 0) v = (o[0] && String(o[0].v).indexOf('blk:') === 0) ? o[0].v : '__skip';
  else if (t.indexOf('ドン!!-') >= 0) v = 'r';
  else if (t.indexOf('ティーチ') >= 0) v = (o[0] && o[0].v) || '__no';
  else if (t.indexOf('ルーシー') >= 0) v = false;
  else {
    const x = o.find((z: any) => z.primary) || o.find((z: any) => z.v && String(z.v).indexOf('pick:') === 0) || o[0];
    v = x ? x.v : undefined;
  }
  try { prompt.onPick && prompt.onPick(v); } catch { /* ignore */ }
}

describe('1人回し（cpuHuman）', () => {
  it('cpu席も人間として構築され、両席を人間操作で1局回しきれる', async () => {
    const engine = useEngineStore.getState().initEngine();
    const G = engine.G;

    let answeredId = -1;
    const unsub = useEngineStore.subscribe((s) => {
      const p = s.prompt as any;
      if (p && p.id !== answeredId) {
        answeredId = p.id;
        (globalThis as any).setImmediate(() => {
          const cur = useEngineStore.getState().prompt as any;
          if (cur && cur.id === answeredId) autoAnswer(cur);
        });
      }
    });

    // 手番側（me/cpu どちらでも）を同じ操作系で回す＝UI が mySeat を反転させながら操作するのと等価。
    async function pilot(side: 'me' | 'cpu') {
      const P = G.players[side];
      let g = 0;
      while (g++ < 25) {
        const c = P.hand.find((x: any) => engine.handPlayable(x));
        if (!c) break;
        await engine.tryPlayHand(c);
        if (G.winner) return;
      }
      while (P.don.active > 0) { P.leader.attachedDon++; P.don.active--; }
      g = 0;
      while (g++ < 14 && engine.canAttackThisTurn(side)) {
        const a = [P.leader, ...P.chars].filter((x: any) => engine.canCardAttack(x))[0];
        if (!a) break;
        const tg = engine.legalTargets(side);
        if (!tg.length) break;
        await engine.declareAttack(a, tg[0]);
        if (G.winner) return;
      }
      engine.uiEndTurn(side);
    }

    G.players = {} as any;
    G.winner = null;
    G.inGame = false;
    engine.startGame('lucy', 'enel', { cpuHuman: true });

    let it = 0, busy = false, cpuTurnsPiloted = 0;
    while (!G.winner && it < 400000) {
      await new Promise<void>((r) => (globalThis as any).setImmediate(r));
      it++;
      if (G.myActable && !G.busy && !useEngineStore.getState().prompt && !busy) {
        const side = G.active as 'me' | 'cpu';
        busy = true;
        if (side === 'cpu') cpuTurnsPiloted++; // ★相手ターンが CPU に自動処理されず人間へ渡ってきた証拠
        await pilot(side);
        busy = false;
      }
    }
    unsub();

    // cpu 席は人間扱い（CPU AI・自動マリガンが走らない）
    expect(G.players.cpu.isCPU).toBe(false);
    expect(G.players.me.isCPU).toBe(false);
    expect(cpuTurnsPiloted).toBeGreaterThan(0); // 相手ターンを自分で操作できた
    expect(G.winner === 'me' || G.winner === 'cpu').toBe(true);
    expect(it).toBeLessThan(400000); // 固まっていない

    engine.backToSelect();
    expect(G.inGame).toBe(false);
  }, 120000);
});

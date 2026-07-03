// React の store + 実 reactAdapter 経路で1局を完走させ、対話ループ（mulligan/防御/対象選択が
// store.prompt 経由で解決して進行する）が固まらないことを検証する。実プレイの統合確認。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { useEngineStore } from '../src/state/engineStore';

// reactAdapter.fxNote は globalThis.setTimeout を使うのでテスト中は即時化（高速化）。
let realST: any;
beforeAll(() => { realST = globalThis.setTimeout; (globalThis as any).setTimeout = (cb: any) => { (globalThis as any).setImmediate(cb); return 0 as any; }; });
afterAll(() => { (globalThis as any).setTimeout = realST; });

// プロンプト自動応答（headlessAdapter と同方針）。humanPick も prompt(pick:uid付き)で来るのでこれで両対応。
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

describe('React adapter + store drive a real game to completion', () => {
  it('completes without hanging (mulligan/defense/target prompts resolve via store)', async () => {
    const engine = useEngineStore.getState().initEngine();
    const G = engine.G;

    // store.prompt が出るたびに自動応答（= UIのクリック相当）。
    let answeredId = -1;
    const unsub = useEngineStore.subscribe((s) => {
      const p = s.prompt as any;
      if (p && p.id !== answeredId) {
        answeredId = p.id;
        (globalThis as any).setImmediate(() => {
          // まだ同じプロンプトが生きていれば応答
          const cur = useEngineStore.getState().prompt as any;
          if (cur && cur.id === answeredId) autoAnswer(cur);
        });
      }
    });

    // me のメイン操作（cpu-vs-cpu の pilotMe 相当）。
    async function pilotMe() {
      const me = G.players.me;
      let g = 0;
      while (g++ < 25) {
        const c = me.hand.find((x: any) => engine.handPlayable(x));
        if (!c) break;
        await engine.tryPlayHand(c);
        if (G.winner) return;
      }
      while (me.don.active > 0) { me.leader.attachedDon++; me.don.active--; }
      g = 0;
      while (g++ < 14 && engine.canAttackThisTurn('me')) {
        const a = [me.leader, ...me.chars].filter((x: any) => engine.canCardAttack(x))[0];
        if (!a) break;
        const tg = engine.legalTargets('me');
        if (!tg.length) break;
        await engine.declareAttack(a, tg[0]);
        if (G.winner) return;
      }
      engine.uiEndTurn();
    }

    G.players = {} as any;
    G.winner = null;
    G.inGame = false;
    engine.startGame('lucy', 'enel');

    let it = 0, busy = false;
    while (!G.winner && it < 400000) {
      await new Promise<void>((r) => (globalThis as any).setImmediate(r));
      it++;
      if (G.active === 'me' && G.myActable && !G.busy && !useEngineStore.getState().prompt && !busy) {
        busy = true;
        await pilotMe();
        busy = false;
      }
    }
    unsub();

    expect(G.winner === 'me' || G.winner === 'cpu').toBe(true);
    expect(it).toBeLessThan(400000); // 固まっていない

    // 離脱経路: backToSelect で対戦終了状態に戻る（App が DeckSelect へ切替できる）
    engine.backToSelect();
    expect(G.inGame).toBe(false);
  }, 120000);
});

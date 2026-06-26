import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine/bootstrap';
import { headlessAdapter } from '../src/engine/ui-adapter';

// 移植エンジンの回帰: ルートの tests/cpu-vs-cpu.js と同等の検証を vitest で実行する。
// 合格条件（ルートと同じ）: noWinner=0（必ず勝者が出る）/ doubleAttacks=0（同一ターンに同じカードが二度アタックしない）。

describe('ported engine boots', () => {
  it('loads card DB and built-in decks', () => {
    const e = createEngine({ ui: headlessAdapter(), timers: 'immediate', aiOn: false });
    expect(Object.keys(e.C).length).toBeGreaterThan(1000); // 3000枚超のはず
    expect(Array.isArray(e.DECKS)).toBe(true);
    expect(e.DECKS.length).toBeGreaterThanOrEqual(6);
    expect(typeof e.startGame).toBe('function');
    expect(typeof e.declareAttack).toBe('function');
    expect(typeof e.cpuTurn).toBe('function');
  });
});

describe('CPU vs CPU round-robin (headless)', () => {
  it('every matchup produces a winner with no double-attacks', async () => {
    // 二重アタック検出: declareAttack をラップする onAttack で計測（ルート tests/cpu-vs-cpu.js と同方式）。
    let dbl = 0;
    const seen: Record<string, number> = {};
    const ui = headlessAdapter();
    let API: any;
    ui.onAttack = (attacker: any) => {
      if (!attacker) return;
      if (API.G._sim) return; // 先読みシミュ中の攻撃は実攻撃でないので計測しない
      const k = API.G.active + '#' + API.G.turnSeq + '#' + attacker.uid;
      if (seen[k]) dbl++;
      seen[k] = 1;
    };

    API = createEngine({ ui, timers: 'immediate', aiOn: false });
    const { G } = API;

    async function pilotMe() {
      const me = G.players.me;
      let g = 0;
      while (g++ < 25) {
        const c = me.hand.find((c: any) => API.handPlayable(c));
        if (!c) break;
        await API.tryPlayHand(c);
        if (G.winner) return;
      }
      if (me.leader.base.leader === 'enel' && me.turnsTaken >= 2 && me._enelUsedTurn !== G.turnSeq) {
        await API.leaderActivate('me');
      }
      while (me.don.active > 0) { me.leader.attachedDon++; me.don.active--; }
      g = 0;
      while (g++ < 14 && API.canAttackThisTurn('me')) {
        const a = [me.leader, ...me.chars].filter(API.canCardAttack)[0];
        if (!a) break;
        const tg = API.legalTargets('me');
        if (!tg.length) break;
        await API.declareAttack(a, tg[0]);
        if (G.winner) return;
      }
      API.uiEndTurn();
    }

    function tick() { return new Promise<void>((r) => setImmediate(r)); }

    async function playOne(a: string, b: string): Promise<string> {
      G.players = {};
      G.winner = null;
      G.inGame = false;
      API.startGame(a, b);
      let it = 0, busy = false;
      while (!G.winner && it < 500000) {
        await tick();
        it++;
        if (G.active === 'me' && G.myActable && !G.busy && !busy) {
          busy = true;
          await pilotMe();
          busy = false;
        }
      }
      return G.winner || '(none)';
    }

    const decks = ['enel', 'lucy', 'ace', 'nami', 'hancock', 'teach'];
    let games = 0, noWinner = 0;
    for (let i = 0; i < decks.length; i++) {
      for (let j = 0; j < decks.length; j++) {
        if (i === j) continue;
        const w = await playOne(decks[i], decks[j]);
        games++;
        if (w === '(none)') noWinner++;
      }
    }

    expect(games).toBe(30);
    expect(noWinner).toBe(0);
    expect(dbl).toBe(0);
  }, 180000);
});

import { it, expect } from 'vitest';
import { createEngine } from '../src/engine/bootstrap';
import { headlessAdapter } from '../src/engine/ui-adapter';

// aiOn のとき、CPUの手番で実際に Claude(/v1/messages→/api/ai) を呼ぶかを確認。
// 呼ぶなら「実行されない」原因は純粋にトグルのタイミング（→デッキ選択で設定すれば解決）。
it('CPU turn calls Claude when G.aiOn is true', async () => {
  const calls: string[] = [];
  const ui = headlessAdapter();
  ui.fetch = ((input: any) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    calls.push(url);
    const body = JSON.stringify({ content: [{ type: 'text', text: '{"intent":"盤面除去を優先","aggression":"mid","removalPriority":[]}' }] });
    return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }) as any;

  const e = createEngine({ ui, timers: 'immediate', aiOn: true });
  const G = e.G;
  G.players = {} as any; G.winner = null; G.inGame = false;
  e.startGame('teach', 'enel');

  const tick = () => new Promise<void>((r) => setImmediate(r));
  let n = 0;
  while (n < 300000 && !calls.some((u) => u.indexOf('/v1/messages') >= 0)) {
    await tick(); n++;
    if (G.winner) break;
    if (G.active === 'me' && G.myActable && !G.busy && !G.promptState && !G.pendingChoice) {
      e.uiEndTurn(); // 自分は何もせず即終了→CPU手番へ進める
    }
  }
  expect(calls.some((u) => u.indexOf('/v1/messages') >= 0)).toBe(true); // CPU手番でClaudeを呼んだ
  expect(String(G._aiIntent || '')).toContain('盤面除去'); // 返ってきたintentが反映・表示された
}, 60000);

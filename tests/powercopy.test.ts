import { it, expect } from 'vitest';
import { createEngine } from '../src/engine/bootstrap';
import { headlessAdapter } from '../src/engine/ui-adapter';

it('powerCopy copies chosen char power exactly (8000 -> 8000, no inflation)', async () => {
  const e = createEngine({ ui: headlessAdapter(), timers: 'immediate', aiOn: false });
  const G = e.G;
  G.players = {} as any; G.winner = null; G.inGame = false;
  e.startGame('teach', 'teach');
  let n = 0; while (n < 100000) { await new Promise<void>((r) => setImmediate(r)); n++; if (G.inGame && G.players.cpu) break; }

  const cat = e.inst('OP16-104'); cat.owner = 'cpu';
  G.players.cpu.chars = [cat];
  const tgt = e.inst('OP09-084'); tgt.owner = 'me';
  G.players.me.chars = [tgt];
  tgt.buffs.push({ amt: 8000 - e.power(tgt) }); // 現在パワーを正確に8000へ
  expect(e.power(tgt)).toBe(8000);
  expect(cat.attachedDon).toBe(0);
  const catBaseBefore = e.power(cat);
  console.log('catalina base power before:', catBaseBefore, 'target:', e.power(tgt));

  G.active = 'cpu';
  await e.runFx([{ op: 'powerCopy' }], { self: cat, side: 'cpu' });
  expect(e.power(cat)).toBe(8000); // 8000対象をコピー → 8000（10000などに膨らまない）

  // ★複数回適用しても二重加算で膨らまない（同ターン再アタック/先読みの模擬発動を想定）
  await e.runFx([{ op: 'powerCopy' }], { self: cat, side: 'cpu' });
  expect(e.power(cat)).toBe(8000); // 置換型なので2回目も8000のまま

  // 別の対象（5000）に変えると置換されて5000（前回の8000を引きずらない）
  tgt.buffs.length = 0; tgt.buffs.push({ amt: 5000 - e.power(tgt) }); expect(e.power(tgt)).toBe(5000);
  await e.runFx([{ op: 'powerCopy' }], { self: cat, side: 'cpu' });
  expect(e.power(cat)).toBe(5000);
});

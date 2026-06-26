import { describe, it, expect } from 'vitest';
import { makeReactAdapter, type AdapterStoreApi } from '../src/engine/reactAdapter';
import type { PromptState, PickState } from '../src/engine/types';

// 最小モック store（zustand を使わずアダプタ単体を検証）
function mockStore() {
  const state = {
    engine: { G: {} as any },
    muted: false,
    bumps: 0,
    prompt: null as PromptState | null,
    pick: null as PickState | null,
    bump() { state.bumps++; },
    setPrompt: (p: PromptState | null) => { state.prompt = p; },
    setPick: (p: PickState | null) => { state.pick = p; },
    pushFx: () => {},
    setAtk: () => {},
    setEnd: () => {},
    setThinking: () => {},
    pushLog: () => {},
  };
  const api: AdapterStoreApi = { getState: () => state as any };
  return { state, api };
}

describe('reactAdapter render (_sim guard + rAFコアレス)', () => {
  it('does not bump while G._sim is true; coalesces multiple renders into one bump', async () => {
    const { state, api } = mockStore();
    const ui = makeReactAdapter(api);
    state.engine.G._sim = true;
    ui.render!(); ui.render!();
    await new Promise((r) => setTimeout(r, 40));
    expect(state.bumps).toBe(0); // AI探索中は描画しない
    state.engine.G._sim = false;
    ui.render!(); ui.render!(); ui.render!(); // 同フレーム多数 → 1回に集約
    await new Promise((r) => setTimeout(r, 40));
    expect(state.bumps).toBe(1);
  });
});

describe('reactAdapter showPrompt', () => {
  it('resolves with the picked value and clears prompt', async () => {
    const { state, api } = mockStore();
    const ui = makeReactAdapter(api);
    const p = ui.showPrompt!({ title: 't', opts: [{ t: 'A', v: 'a' }, { t: 'B', v: 'b' }] });
    expect(state.prompt).toBeTruthy();
    // ユーザーが B を押す
    state.prompt!.onPick!('b');
    await expect(p).resolves.toBe('b');
    expect(state.prompt).toBeNull();
  });
});

describe('reactAdapter humanPick', () => {
  it('returns null immediately for empty candidates', async () => {
    const { api } = mockStore();
    const ui = makeReactAdapter(api);
    await expect(ui.humanPick!([], 'x')).resolves.toBeNull();
  });

  it('resolves via board pick (pick.resolve)', async () => {
    const { state, api } = mockStore();
    const ui = makeReactAdapter(api);
    const c1 = { uid: 1, base: { no: 'OP01-001', name: 'A' } };
    const c2 = { uid: 2, base: { no: 'OP01-002', name: 'B' } };
    const p = ui.humanPick!([c1, c2], 'choose');
    expect(state.pick).toBeTruthy();
    expect(state.pick!.uids.has(2)).toBe(true);
    // 盤面で c2 をクリック
    state.pick!.resolve(c2 as any);
    await expect(p).resolves.toBe(c2);
    expect(state.pick).toBeNull();
    expect(state.prompt).toBeNull();
  });

  it('resolves via modal button (pick:uid)', async () => {
    const { state, api } = mockStore();
    const ui = makeReactAdapter(api);
    const c1 = { uid: 7, base: { no: 'OP01-001', name: 'A' } };
    const p = ui.humanPick!([c1], 'choose');
    const opt = state.prompt!.opts!.find((o) => o.v === 'pick:7');
    expect(opt).toBeTruthy();
    state.prompt!.onPick!('pick:7');
    await expect(p).resolves.toBe(c1);
  });

  it('optional skip resolves null', async () => {
    const { state, api } = mockStore();
    const ui = makeReactAdapter(api);
    const c1 = { uid: 9, base: { no: 'OP01-001', name: 'A' } };
    const p = ui.humanPick!([c1], 'choose', true);
    state.prompt!.onPick!('__skip');
    await expect(p).resolves.toBeNull();
  });
});

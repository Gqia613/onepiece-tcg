// @vitest-environment happy-dom
// デッキ作成のリーダー色フィルタ 複数選択（AND=選んだ色を全て含むリーダーに絞る）の回帰。
import { describe, it, expect, beforeAll } from 'vitest';
import { render as rtl, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { createEngine } from '../src/engine/bootstrap';
import { headlessAdapter } from '../src/engine/ui-adapter';
import { useEngineStore } from '../src/state/engineStore';
import DeckBuilder from '../src/screens/DeckBuilder';

const render = (ui: ReactElement) => rtl(<MemoryRouter>{ui}</MemoryRouter>);
let engine: any;
beforeAll(() => {
  engine = createEngine({ ui: headlessAdapter(), timers: 'immediate', aiOn: false });
  act(() => { useEngineStore.setState({ engine, version: 1 }); useEngineStore.getState().setBuilderOpen(true, null); });
});

const chip = (root: Element, label: string) =>
  Array.from(root.querySelectorAll('button.bd-fbtn')).find((b) => (b.textContent || '') === label) as HTMLButtonElement;
// DeckBuilder と同じ数え方（全 leader、パラレル含む）
const leaderCount = (pred: (color: string[]) => boolean) => {
  const C = engine.C; let n = 0;
  for (const no in C) { const c = C[no]; if (c.leader && pred(c.color || [])) n++; }
  return n;
};

describe('デッキ作成: リーダー色フィルタ 複数選択', () => {
  it('複数の色チップを選ぶと「全て含む」リーダーに絞られ、全色でクリアできる', () => {
    const { container } = render(<DeckBuilder />);
    const total = container.querySelectorAll('.bd-leader').length;
    expect(total).toBe(leaderCount(() => true));

    act(() => { fireEvent.click(chip(container, '赤')); });
    const red = container.querySelectorAll('.bd-leader').length;
    expect(red).toBe(leaderCount((c) => c.includes('赤')));

    act(() => { fireEvent.click(chip(container, '青')); }); // 赤＋青（AND）
    const redBlue = container.querySelectorAll('.bd-leader').length;
    expect(redBlue).toBe(leaderCount((c) => c.includes('赤') && c.includes('青')));
    expect(redBlue).toBeGreaterThan(0);   // 赤青リーダーは存在
    expect(redBlue).toBeLessThan(red);    // 赤単などが除外され減る

    act(() => { fireEvent.click(chip(container, '青')); }); // 青を解除→赤のみに戻る（トグル）
    expect(container.querySelectorAll('.bd-leader').length).toBe(red);

    act(() => { fireEvent.click(chip(container, '全色')); }); // 全色でクリア
    expect(container.querySelectorAll('.bd-leader').length).toBe(total);
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { createEngine } from '../src/engine/bootstrap';
import { headlessAdapter } from '../src/engine/ui-adapter';
import { useEngineStore } from '../src/state/engineStore';
import DeckBuilder from '../src/screens/DeckBuilder';

beforeAll(() => {
  const engine = createEngine({ ui: headlessAdapter(), timers: 'immediate', aiOn: false });
  act(() => { useEngineStore.setState({ engine, version: 1, builderOpen: true }); });
});
afterEach(() => cleanup());

describe('DeckBuilder', () => {
  it('lists leaders, builds a pool on leader pick, and adds cards', () => {
    render(<DeckBuilder />);
    // リーダー一覧が出る
    const leaders = document.querySelectorAll('.bd-leader');
    expect(leaders.length).toBeGreaterThan(5);
    // リーダー未選択時はプール無し
    expect(document.querySelectorAll('.bd-tile').length).toBe(0);

    // リーダーを1枚選ぶ
    act(() => { fireEvent.click(leaders[0]); });
    const tiles = document.querySelectorAll('.bd-tile');
    expect(tiles.length).toBeGreaterThan(0); // 色一致カードのプールが出る

    // ステータスバーが出て 0/50
    expect(document.querySelector('.bd-st-count')?.textContent).toContain('0');

    // 1枚追加 → 合計1
    const addBtn = document.querySelector('.bd-tile .bd-pl') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
    act(() => { fireEvent.click(addBtn); });
    expect(document.querySelector('.bd-st-count')?.textContent).toContain('1');
    // デッキ内容に行が出る
    expect(document.querySelectorAll('.bd-deck-list .bd-row').length).toBeGreaterThan(0);
  });

  it('enforces 4-copy limit per card', () => {
    render(<DeckBuilder />);
    act(() => { fireEvent.click(document.querySelectorAll('.bd-leader')[0]); });
    const add = document.querySelector('.bd-tile .bd-pl') as HTMLButtonElement;
    for (let i = 0; i < 6; i++) act(() => { fireEvent.click(add); });
    // 同名4枚まで → そのカードは4枚で頭打ち（合計は4のはず）
    expect(document.querySelector('.bd-st-count')?.textContent).toContain('4');
  });
});

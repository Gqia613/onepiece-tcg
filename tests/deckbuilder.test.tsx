// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render as rtlRender, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { createEngine } from '../src/engine/bootstrap';
import { headlessAdapter } from '../src/engine/ui-adapter';
import { useEngineStore } from '../src/state/engineStore';
import DeckBuilder from '../src/screens/DeckBuilder';

// 画面はルーター配下で動く（useNavigate/useLocation）ため MemoryRouter で包む
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

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

  it('filters leaders by color and pack', () => {
    render(<DeckBuilder />);
    const allCount = document.querySelectorAll('.bd-leader').length;
    // 色フィルタ「赤」
    const redBtn = [...document.querySelectorAll('.bd-filters .bd-fbtn')].find((b) => b.textContent === '赤') as HTMLButtonElement;
    expect(redBtn).toBeTruthy();
    act(() => { fireEvent.click(redBtn); });
    const redCount = document.querySelectorAll('.bd-leader').length;
    expect(redCount).toBeGreaterThan(0);
    expect(redCount).toBeLessThan(allCount);
    // 全色に戻して弾（OP01）で絞る
    const allBtn = [...document.querySelectorAll('.bd-filters .bd-fbtn')].find((b) => b.textContent === '全色') as HTMLButtonElement;
    act(() => { fireEvent.click(allBtn); });
    const packSel = document.querySelector('.bd-fsel') as HTMLSelectElement;
    act(() => { fireEvent.change(packSel, { target: { value: 'OP01' } }); });
    const packCount = document.querySelectorAll('.bd-leader').length;
    expect(packCount).toBeGreaterThan(0);
    expect(packCount).toBeLessThan(allCount);
  });

  it('collapses leader section after pick and reopens via リーダー変更', () => {
    render(<DeckBuilder />);
    act(() => { fireEvent.click(document.querySelectorAll('.bd-leader')[0]); });
    // 選択後はコンパクト表示・一覧は畳まれる
    expect(document.querySelector('.bd-lead-cur')).toBeTruthy();
    expect(document.querySelector('.bd-lead-row')).toBeNull();
    // 「リーダー変更」で再展開
    act(() => { fireEvent.click(document.querySelector('.bd-lead-cur .bd-fbtn') as HTMLButtonElement); });
    expect(document.querySelector('.bd-lead-row')).toBeTruthy();
    expect(document.querySelector('.bd-lead-cur')).toBeNull();
  });

  it('toggles deck list panel visibility', () => {
    render(<DeckBuilder />);
    act(() => { fireEvent.click(document.querySelectorAll('.bd-leader')[0]); });
    expect(document.querySelector('.bd-panel .bd-rows')).toBeTruthy();
    act(() => { fireEvent.click(document.querySelector('.bd-panel-head.tgl') as HTMLElement); });
    expect(document.querySelector('.bd-panel .bd-rows')).toBeNull();
    expect(document.querySelector('.bd-main.nolist')).toBeTruthy();
    act(() => { fireEvent.click(document.querySelector('.bd-panel-head.tgl') as HTMLElement); });
    expect(document.querySelector('.bd-panel .bd-rows')).toBeTruthy();
    expect(document.querySelector('.bd-main.nolist')).toBeNull();
  });

  it('opens card zoom overlay from pool art', () => {
    render(<DeckBuilder />);
    act(() => { fireEvent.click(document.querySelectorAll('.bd-leader')[0]); });
    expect(document.querySelector('.card-zoom-back')).toBeNull();
    act(() => { fireEvent.click(document.querySelector('.bd-tile .bd-art') as HTMLElement); });
    expect(document.querySelector('.card-zoom-back')).toBeTruthy();
  });

  it('opens an existing cloud deck for editing (builderDeck)', () => {
    const engine = useEngineStore.getState().engine!;
    const base = (engine.DECKS as any[])[0];
    act(() => { useEngineStore.setState({ builderDeck: { ...base, cloud: true } as any }); });
    render(<DeckBuilder />);
    // 編集モード: 見出し・上書き保存ラベル・リーダーはコンパクト表示・枚数が引き継がれる
    expect(document.querySelector('.bd-head h1')?.textContent).toBe('デッキ編集');
    expect(document.querySelector('.bd-save')?.textContent).toContain('上書き保存');
    expect(document.querySelector('.bd-lead-cur')).toBeTruthy();
    const total = Object.values(base.list as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
    expect(document.querySelector('.bd-st-count')?.textContent).toContain(String(total));
    // 統計（コストカーブ 0〜8+ の9本）が出る
    expect(document.querySelectorAll('.bd-panel .bd-stats .bd-cv-bar').length).toBe(9);
    act(() => { useEngineStore.setState({ builderDeck: null }); });
  });

  it('opens a preset deck as a copy (new save, name suffixed)', () => {
    const engine = useEngineStore.getState().engine!;
    const base = (engine.DECKS as any[])[0];
    act(() => { useEngineStore.setState({ builderDeck: base as any }); });
    render(<DeckBuilder />);
    expect((document.querySelector('.bd-name') as HTMLInputElement).value).toContain('（コピー）');
    expect(document.querySelector('.bd-save')?.textContent).toContain('保存');
    act(() => { useEngineStore.setState({ builderDeck: null }); });
  });
});

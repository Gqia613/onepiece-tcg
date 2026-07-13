// @vitest-environment happy-dom
// 公開カードの大写し（CardReveal）。サーチで手札に加えたカード／イベント・カウンターの発動カードは
// 盤面に残らないため「何が起きたか分からない」→ fxQueue の type:'reveal' を必ず描画する。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { CardReveal } from '../src/components/fx/CardReveal';
import { useEngineStore } from '../src/state/engineStore';
import { useNetStore } from '../src/state/netStore';

const pushReveal = (id: number, side: 'me' | 'cpu', no: string, name: string, label: string) =>
  act(() => { useEngineStore.getState().pushFx({ type: 'reveal', id, side, no, name, label } as any); });

beforeEach(() => {
  act(() => {
    useEngineStore.setState({ fxQueue: [] });
    useNetStore.setState({ mySeat: 'me' } as any);
  });
});
afterEach(() => cleanup());

describe('CardReveal（公開カードの大写し）', () => {
  it('reveal が無ければ何も描かない', () => {
    render(<CardReveal />);
    expect(document.querySelector('.reveal-card')).toBeFalsy();
  });

  it('サーチで手札に加えたカードを、名前とラベル付きで表示する', () => {
    render(<CardReveal />);
    pushReveal(1, 'me', 'ST31-001', 'サンジ', '手札に加えた');
    const card = document.querySelector('.reveal-card');
    expect(card).toBeTruthy();
    expect(card?.className).toContain('mine');
    expect(document.querySelector('.rv-name')?.textContent).toBe('サンジ');
    expect(document.querySelector('.rv-label')?.textContent).toContain('手札に加えた');
    // 取り込んだ fx はキューから消す（同じ演出が再生され続けない）
    expect(useEngineStore.getState().fxQueue.length).toBe(0);
  });

  it('相手が使ったイベントは相手側の見た目で表示する（誰が使ったか分かる）', () => {
    render(<CardReveal />);
    pushReveal(2, 'cpu', 'OP12-039', '三刀流居合', 'イベント発動');
    const card = document.querySelector('.reveal-card');
    expect(card?.className).toContain('opp');
    expect(document.querySelector('.rv-label')?.textContent).toContain('相手');
  });

  // イベント/カウンター発動は「何を使われたのか」が最も分かりにくいので大型カットインにする
  it('イベント発動は大型カットイン（ev-cut）で見せる', () => {
    render(<CardReveal />);
    act(() => {
      useEngineStore.getState().pushFx({
        type: 'reveal', id: 10, side: 'me', no: 'OP12-039', name: 'ルフィは海賊王になる男だ!!!', label: 'イベント発動', kind: 'event',
      } as any);
    });
    const cut = document.querySelector('.ev-cut');
    expect(cut).toBeTruthy();
    expect(cut?.className).toContain('mine');
    expect(document.querySelector('.ev-name')?.textContent).toBe('ルフィは海賊王になる男だ!!!');
    expect(document.querySelector('.ev-chip')?.textContent).toContain('イベント発動');
    // 控えめ版（手札に加えた）とは別物である
    expect(document.querySelector('.reveal-card')).toBeFalsy();
  });

  it('相手のカウンター発動も大型カットイン（相手側の見た目）', () => {
    render(<CardReveal />);
    act(() => {
      useEngineStore.getState().pushFx({
        type: 'reveal', id: 11, side: 'cpu', no: 'OP01-025', name: 'ゴムゴムの銃乱打', label: 'カウンター発動', kind: 'event',
      } as any);
    });
    expect(document.querySelector('.ev-cut')?.className).toContain('opp');
    expect(document.querySelector('.ev-chip')?.textContent).toContain('相手');
  });

  it('連続で公開されても取りこぼさず1枚ずつ見せる（キューに積む）', () => {
    render(<CardReveal />);
    pushReveal(3, 'me', 'ST31-001', 'サンジ', '手札に加えた');
    pushReveal(4, 'me', 'ST31-002', 'ジンベエ', '手札に加えた');
    // 1枚目を表示中。2枚目はキュー待ちで、まだ描画されていない
    expect(document.querySelectorAll('.reveal-card').length).toBe(1);
    expect(document.querySelector('.rv-name')?.textContent).toBe('サンジ');
  });
});

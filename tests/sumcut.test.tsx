// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useEngineStore } from '../src/state/engineStore';
import { SummonCutIn } from '../src/components/fx/SummonCutIn';

afterEach(cleanup);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('SummonCutIn 自動消滅（実時間）', () => {
  it('sumcut 後 3s 以内に必ず消える（並行fxイベントあり）', async () => {
    render(<SummonCutIn />);
    act(() => { useEngineStore.getState().pushFx({ type: 'sumcut', id: 9001, no: 'OP15-058', name: 'エネル' } as any); });
    expect(document.querySelector('.sum-cut')).toBeTruthy();
    act(() => { for (let i = 0; i < 5; i++) useEngineStore.getState().pushFx({ type: 'float', id: 9100 + i, uid: 1, text: '+1000' } as any); });
    await act(async () => { await sleep(2900); });
    expect(document.querySelector('.sum-cut')).toBeFalsy();
  }, 10000);

  it('連続で2枚出ても最後の1枚が時間で消える', async () => {
    render(<SummonCutIn />);
    act(() => { useEngineStore.getState().pushFx({ type: 'sumcut', id: 9201, no: 'OP15-058', name: 'A' } as any); });
    await act(async () => { await sleep(500); });
    act(() => { useEngineStore.getState().pushFx({ type: 'sumcut', id: 9202, no: 'OP16-080', name: 'B' } as any); });
    await act(async () => { await sleep(2900); });
    expect(document.querySelector('.sum-cut')).toBeFalsy();
  }, 10000);
});

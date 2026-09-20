// @vitest-environment happy-dom
// 1人回し（solo）: 相手のターンも自分で操作するモード。
// 実装の要は「mySeat を手番側へ自動追従させる」ことだけ＝盤面/手札/操作判定は全て mySeat 基準なので、
// 席が反転すれば相手ターンも自分のターンと同じ操作系で回せる。ここではその追従と、
// 席固定ラベル（mySeat が動いても「あなた/相手」が入れ替わらないこと）を検証する。
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { SoloSeat, soloSeatFor } from '../src/components/battle/SoloSeat';
import { Hand } from '../src/components/battle/Hand';
import { useEngineStore } from '../src/state/engineStore';
import { useNetStore, seatLabel } from '../src/state/netStore';

const mkCard = (uid: number, owner: 'me' | 'cpu', no = 'OP01-004', type: any = 'CHAR') => ({
  uid, no, owner,
  base: { no, name: 'テスト' + uid, type, color: ['赤'], cost: 1, power: 1000 },
  attachedDon: 0, rested: false, buffs: [], kwGrant: [],
});
const mkPlayer = (side: 'me' | 'cpu') => ({
  isCPU: false, // ★solo は startGame({cpuHuman:true}) 相当＝両席とも人間
  leader: mkCard(side === 'me' ? 1 : 2, side, 'OP01-001', 'LEADER'),
  chars: [] as any[], stage: null, hand: [] as any[], deck: [] as any[], life: [] as any[], trash: [] as any[],
  don: { active: 0, rested: 0 }, donMax: 10, turnsTaken: 1,
});
function fakeEngine(active: 'me' | 'cpu' = 'me'): any {
  const G: any = {
    players: { me: mkPlayer('me'), cpu: mkPlayer('cpu') },
    active, busy: false, myActable: true, winner: null, turnSeq: 1,
    attackSel: null, pendingChoice: null, promptState: null, inGame: true,
  };
  G.players.cpu.hand = [mkCard(10, 'cpu'), mkCard(11, 'cpu')];
  G.players.me.hand = [mkCard(20, 'me')];
  return {
    G,
    power: (c: any) => c.base.power,
    effCost: (_s: any, c: any) => c.base.cost,
    handPlayable: () => false,
    canCardAttack: () => false,
    legalTargets: () => [],
  };
}

afterEach(() => {
  cleanup();
  useNetStore.getState().resetNet();
  useEngineStore.setState({ engine: null });
});

describe('1人回し（solo）', () => {
  it('soloSeatFor は手番側の席を返す（非対戦中は null＝席を動かさない）', () => {
    expect(soloSeatFor(fakeEngine('me').G)).toBe('me');
    expect(soloSeatFor(fakeEngine('cpu').G)).toBe('cpu');
    expect(soloSeatFor({ inGame: false, players: {}, active: 'cpu' })).toBeNull();
    expect(soloSeatFor(null)).toBeNull();
  });

  it('solo=true のとき mySeat が手番（cpu席）へ自動反転する', () => {
    useEngineStore.setState({ engine: fakeEngine('cpu') });
    useNetStore.getState().setSolo(true);
    render(<SoloSeat />);
    expect(useNetStore.getState().mySeat).toBe('cpu');
  });

  it('手番が相手へ移ると席がその場で追従する（ターン境界での反転）', () => {
    const eng = fakeEngine('me');
    useEngineStore.setState({ engine: eng });
    useNetStore.getState().setSolo(true);
    render(<SoloSeat />);
    expect(useNetStore.getState().mySeat).toBe('me');
    // エンジンの beginTurn 相当（G.active 更新 → render()→bump）
    act(() => { eng.G.active = 'cpu'; useEngineStore.getState().bump(); });
    expect(useNetStore.getState().mySeat).toBe('cpu');
    act(() => { eng.G.active = 'me'; useEngineStore.getState().bump(); });
    expect(useNetStore.getState().mySeat).toBe('me');
  });

  it('solo=false（通常のCPU対戦）では mySeat を動かさない', () => {
    useEngineStore.setState({ engine: fakeEngine('cpu') });
    render(<SoloSeat />);
    expect(useNetStore.getState().mySeat).toBe('me');
  });

  it('席が反転すると手札ゾーンは手番側（cpu席）の手札になる', () => {
    useEngineStore.setState({ engine: fakeEngine('cpu') });
    useNetStore.getState().setSolo(true);
    render(<SoloSeat />);
    cleanup();
    const { container } = render(<Hand />);
    expect(container.querySelectorAll('.card').length).toBe(2); // cpu席の手札2枚
  });

  it('ラベルは席固定（mySeat が cpu へ反転しても「あなた/相手」が入れ替わらない）', () => {
    useNetStore.getState().setSolo(true);
    useNetStore.getState().setMySeat('cpu');
    expect(seatLabel('me')).toBe('あなた');
    expect(seatLabel('cpu')).toBe('相手');
    // 通常のCPU対戦は従来どおり mySeat 基準
    useNetStore.getState().setSolo(false);
    useNetStore.getState().setMySeat('me');
    expect(seatLabel('me')).toBe('あなた');
    expect(seatLabel('cpu')).toBe('CPU');
  });
});

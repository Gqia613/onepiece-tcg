// @vitest-environment happy-dom
// mySeat視点反転の描画テスト（オンライン対戦のゲスト＝cpu席が「自分＝画面下段」になること）。
// CSSクラス .side.me/.opp は「自席=下段/相手=上段」の意味に再定義されている（Side.tsx）。
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Side } from '../src/components/battle/Side';
import { Hand } from '../src/components/battle/Hand';
import { useEngineStore } from '../src/state/engineStore';
import { useNetStore } from '../src/state/netStore';

const mkCard = (uid: number, owner: 'me' | 'cpu', no = 'OP01-004', type: any = 'CHAR') => ({
  uid, no, owner,
  base: { no, name: 'テスト' + uid, type, color: ['赤'], cost: 1, power: 1000 },
  attachedDon: 0, rested: false, buffs: [], kwGrant: [],
});
const mkPlayer = (side: 'me' | 'cpu') => ({
  isCPU: false,
  leader: mkCard(side === 'me' ? 1 : 2, side, 'OP01-001', 'LEADER'),
  chars: [] as any[], stage: null, hand: [] as any[], deck: [] as any[], life: [] as any[], trash: [] as any[],
  don: { active: 0, rested: 0 }, donMax: 10, turnsTaken: 1,
});
function fakeEngine(): any {
  const G: any = {
    players: { me: mkPlayer('me'), cpu: mkPlayer('cpu') },
    active: 'me', busy: false, myActable: false, winner: null, turnSeq: 1,
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

describe('mySeat視点反転（オンラインのゲスト席）', () => {
  it("mySeat='cpu' のとき cpu席が自席（.side.me＝下段扱い）・me席が相手（.side.opp）になる", () => {
    useEngineStore.setState({ engine: fakeEngine() });
    useNetStore.getState().setMySeat('cpu');
    const r1 = render(<Side side="cpu" />);
    expect(r1.container.querySelector('.side.me')).toBeTruthy();
    expect(r1.container.querySelector('.side.opp')).toBeFalsy();
    cleanup();
    const r2 = render(<Side side="me" />);
    expect(r2.container.querySelector('.side.opp')).toBeTruthy();
    // 相手側（me席）には手札の裏向きパイルが出る（自席側には出ない）
    expect(r2.container.querySelector('.ga-hand')).toBeTruthy();
  });

  it("mySeat='cpu' のとき Hand は cpu席の手札を描画する", () => {
    useEngineStore.setState({ engine: fakeEngine() });
    useNetStore.getState().setMySeat('cpu');
    const { container } = render(<Hand />);
    expect(container.querySelectorAll('.card').length).toBe(2); // cpu席の手札2枚
  });

  it("既定（オフライン/mySeat='me'）では従来どおり me席が下段・meの手札を描画", () => {
    useEngineStore.setState({ engine: fakeEngine() });
    const r = render(<Side side="me" />);
    expect(r.container.querySelector('.side.me')).toBeTruthy();
    cleanup();
    const h = render(<Hand />);
    expect(h.container.querySelectorAll('.card').length).toBe(1); // meの手札1枚
  });
});

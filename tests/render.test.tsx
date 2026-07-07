// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render as rtlRender, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { createEngine } from '../src/engine/bootstrap';
import { headlessAdapter } from '../src/engine/ui-adapter';
import { useEngineStore } from '../src/state/engineStore';
import Battle from '../src/screens/Battle';
import DeckSelect from '../src/screens/DeckSelect';
import { Prompt } from '../src/components/fx/Prompt';
import { AtkAnnounce } from '../src/components/fx/AtkAnnounce';
import { EndScreen } from '../src/components/fx/EndScreen';
import { CardDetailModal } from '../src/components/fx/CardDetailModal';
import { TrashModal } from '../src/components/fx/TrashModal';

// 画面/オーバーレイはルーター配下で動く（useNavigate）ため MemoryRouter で包む
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

// headless でゲームを「自分が操作可能になる静止点」まで進め、その engine を store に入れて描画する。
let engine: any;

beforeAll(async () => {
  engine = createEngine({ ui: headlessAdapter(), timers: 'immediate', aiOn: false });
  const G = engine.G;
  G.players = {};
  G.winner = null;
  G.inGame = false;
  engine.startGame('lucy', 'enel');
  // 自分の操作可能ターン（盤面が育った静止点）か決着まで進める
  let it = 0;
  while (it < 200000) {
    await new Promise<void>((r) => setImmediate(r));
    it++;
    if (G.winner) break;
    if (G.active === 'me' && G.myActable && !G.busy) break;
  }
  // store に流し込む（React版 adapter ではなく既存 engine をそのまま購読）
  act(() => {
    useEngineStore.setState({ engine, version: 1, prompt: null, pick: null, atk: null, end: null, fxQueue: [], thinking: false });
  });
});

afterEach(() => {
  // store のオーバーレイ状態を初期化（テスト間の干渉防止）
  act(() => {
    useEngineStore.setState({ prompt: null, pick: null, atk: null, end: null, fxQueue: [], thinking: false });
  });
  cleanup();
});

describe('Battle renders a populated game state', () => {
  it('mounts the board structure without crashing', () => {
    render(<Battle />);
    expect(document.querySelector('#board')).toBeTruthy();
    expect(document.querySelector('.felt')).toBeTruthy();
    expect(document.querySelector('.side.me')).toBeTruthy();
    expect(document.querySelector('.side.opp')).toBeTruthy();
    expect(document.querySelector('.lifestack')).toBeTruthy();
    expect(document.querySelector('.handzone')).toBeTruthy();
    // リーダーは必ず2枚以上存在
    expect(document.querySelectorAll('.card.leader').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the Prompt overlay when store.prompt is set', () => {
    render(<Prompt />); // オーバーレイは App 直下（#screen外）にマウントされる
    act(() => {
      useEngineStore.getState().setPrompt({
        id: 1, title: 'テスト選択', text: '選んで', cls: '',
        opts: [{ t: '実行', v: 'a', primary: true }, { t: 'やめる', v: 'b', ghost: true }],
        onPick: () => {},
      } as any);
    });
    expect(document.querySelector('#promptHost')).toBeTruthy();
    expect(document.body.textContent).toContain('テスト選択');
    expect(document.body.textContent).toContain('実行');
  });

  it('renders prompt text as HTML (not escaped) — カウンター等の<b>色付き', () => {
    render(<Prompt />);
    act(() => {
      useEngineStore.getState().setPrompt({
        id: 2, cls: 'defense', title: '🛡 カウンター — あなたの防御',
        text: '「敵」P5000 ⚔ 防御側 P3000　<b style="color:var(--danger-glow)">あと +3000 必要</b>',
        opts: [{ t: 'カウンター終了', v: '__done', primary: true }],
        onPick: () => {},
      } as any);
    });
    // <b> が要素として描画される（生タグ文字列にならない）
    const b = document.querySelector('.prompt p b');
    expect(b).toBeTruthy();
    expect(b!.textContent).toContain('あと +3000 必要');
    // リテラルの "<b" がテキストとして出ていないこと
    expect(document.body.textContent).not.toContain('<b');
  });

  it('shows AtkAnnounce when store.atk is set', () => {
    const me = engine.G.players.me;
    const cpu = engine.G.players.cpu;
    render(<AtkAnnounce />);
    act(() => {
      useEngineStore.getState().setAtk({ aSide: 'me', attacker: me.leader, target: cpu.leader, phase: 'declare' } as any);
    });
    // クラッシュせず、攻撃側/防御側の画像が出る
    expect(document.querySelectorAll('img').length).toBeGreaterThan(0);
  });

  it('shows CardDetailModal (long-press) with card text', () => {
    render(<CardDetailModal />);
    const leader = engine.G.players.me.leader;
    act(() => { useEngineStore.getState().setCardModal(leader); });
    expect(document.querySelector('.cardmodal-box')).toBeTruthy();
    expect(document.body.textContent).toContain(leader.base.name);
  });

  it('shows TrashModal grid for a side', () => {
    render(<TrashModal />);
    // トラッシュに1枚積む
    const me = engine.G.players.me;
    const c = me.deck[0] || me.hand[0] || me.leader;
    act(() => { me.trash.push(c); useEngineStore.getState().setTrashModal('me'); });
    expect(document.querySelector('.trash-modal-grid') || document.body.textContent?.includes('トラッシュ')).toBeTruthy();
    expect(document.body.textContent).toMatch(/トラッシュ/);
  });

  it('shows EndScreen with a replay button when end is set', () => {
    render(<EndScreen />);
    act(() => {
      useEngineStore.getState().setEnd({ win: true } as any);
    });
    expect(document.body.textContent).toMatch(/もう一度|VICTORY|勝/);
  });
});

describe('DeckSelect renders', () => {
  it('lists decks and a start button without crashing', () => {
    // 対戦前状態に
    act(() => { engine.G.inGame = false; useEngineStore.setState({ version: useEngineStore.getState().version + 1 }); });
    render(<DeckSelect />);
    // 組み込みデッキ(6種)が自分用/CPU用の2グリッドで複数出る（リーダー画像は背景画像=.art）
    expect(document.querySelectorAll('.deck-card').length).toBeGreaterThan(2);
    expect(document.querySelectorAll('.art').length).toBeGreaterThan(2);
    expect(document.body.textContent).toMatch(/BATTLE START|開始|スタート/i);
  });
});

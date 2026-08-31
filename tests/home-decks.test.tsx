// @vitest-environment happy-dom
// ホーム（/）とマイデッキ（/decks）のスモークテスト。ルーティング導入で追加した2画面が
// エンジン入りの store でクラッシュせず、主要な導線（メニューカード/デッキグリッド）が出ることを確認する。
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render as rtlRender, cleanup, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactElement } from 'react';
import { createEngine } from '../src/engine/bootstrap';
import { headlessAdapter } from '../src/engine/ui-adapter';
import { useEngineStore } from '../src/state/engineStore';
import Home from '../src/screens/Home';
import Decks from '../src/screens/Decks';

let engine: any;

beforeAll(() => {
  engine = createEngine({ ui: headlessAdapter(), timers: 'immediate', aiOn: false });
  act(() => {
    useEngineStore.setState({ engine, version: 1 });
  });
});

afterEach(() => cleanup());

const render = (ui: ReactElement, path = '/') =>
  rtlRender(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe('Home（タイトル/ハブ画面）', () => {
  it('タイトルと5つのメニューカード（対戦/オンライン/マイデッキ/作成/戦績）が出る', () => {
    render(<Home />);
    // タイトルは公式「ONE PIECE CARD GAME」ロゴ画像（白）に変更
    expect(document.querySelector('img.home-logo')).toBeTruthy();
    expect(document.querySelectorAll('.home-card').length).toBe(5);
    // メインラベルは日本語1行に統合（旧BATTLE/MY DECKS/BUILDERの英語は撤去）
    expect(document.body.textContent).toContain('CPU対戦');
    expect(document.body.textContent).toContain('オンライン対戦');
    expect(document.body.textContent).toContain('マイデッキ');
    expect(document.body.textContent).toContain('戦績');
    expect(document.body.textContent).toContain('デッキ作成');
    // 並び順: デッキ系（マイデッキ→デッキ作成）を隣接させ、戦績は最後
    const order = [...document.querySelectorAll('.home-card .hc-en')].map((e) => e.textContent);
    expect(order).toEqual(['CPU対戦', 'オンライン対戦', 'マイデッキ', 'デッキ作成', '戦績']);
  });

  it('対戦中は復帰バナーと「対戦に戻る」表示になる', () => {
    act(() => { engine.G.inGame = true; useEngineStore.getState().bump(); });
    render(<Home />);
    expect(document.querySelector('.home-resume')).toBeTruthy();
    expect(document.body.textContent).toContain('対戦に戻る');
    act(() => { engine.G.inGame = false; useEngineStore.getState().bump(); });
  });

  it('メニューカードから対戦セットアップへ遷移する（/battle でセットアップ画面）', () => {
    rtlRender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/battle" element={<div id="battle-setup-stub" />} />
        </Routes>
      </MemoryRouter>
    );
    act(() => { fireEvent.click(document.querySelector('.hc-battle')!); });
    expect(document.querySelector('#battle-setup-stub')).toBeTruthy();
  });
});

describe('Decks（マイデッキ/デッキ管理）', () => {
  it('プリセットのグリッドと作成/インポート導線が出る', () => {
    render(<Decks />, '/decks');
    expect(document.body.textContent).toContain('マイデッキ');
    expect(document.body.textContent).toContain('プリセットデッキ');
    // ホームへ戻るボタン（クロス導線=「対戦へ」は撤去）
    expect(document.querySelector('.bd-head .bd-back')).toBeTruthy();
    expect(document.body.textContent).not.toContain('対戦へ');
    // プリセットは組み込みデッキ数ぶん DeckCard が出る
    expect(document.querySelectorAll('.deck-card').length).toBe((engine.DECKS || []).length);
    expect(document.body.textContent).toContain('デッキを作成');
    expect(document.body.textContent).toContain('インポート');
  });

  it('保存デッキが無いときは空状態、あるときはマイデッキ節に出る', () => {
    render(<Decks />, '/decks');
    expect(document.body.textContent).toContain('まだ保存したデッキがありません');
    cleanup();

    const base = (engine.DECKS as any[])[0];
    act(() => {
      engine.G.customDecks = [{ ...base, id: 'cloud-1', name: 'テスト保存デッキ', cloud: true }];
      useEngineStore.getState().bump();
    });
    render(<Decks />, '/decks');
    expect(document.body.textContent).not.toContain('まだ保存したデッキがありません');
    expect(document.body.textContent).toContain('テスト保存デッキ');
    // タイル上にはアイコンを出さない（操作はカードリストモーダル内に集約）
    expect(document.querySelector('.deck-card button[title="このデッキを削除"]')).toBeFalsy();
    // タップでモーダルを開くと、クラウドデッキには「編集」「削除」が出る
    const card = Array.from(document.querySelectorAll('.deck-card')).find((c) => (c.textContent || '').includes('テスト保存デッキ'))!;
    act(() => { fireEvent.click(card); });
    const modalBtns = () => Array.from(document.querySelectorAll('.modal button')).map((b) => b.textContent || '');
    expect(modalBtns()).toContain('編集');
    expect(modalBtns()).toContain('削除');
    act(() => { engine.G.customDecks = []; useEngineStore.getState().bump(); });
  });

  it('デッキカードのタップでカードリストモーダルが開く', () => {
    render(<Decks />, '/decks');
    act(() => { fireEvent.click(document.querySelector('.deck-card')!); });
    expect(document.querySelector('.modal-back')).toBeTruthy();
    expect(document.body.textContent).toContain('リーダー：');
  });

  // マイデッキ（クラウド保存デッキ）も「コピーして編集」できる＝上書きではなく複製が作れる。
  it('マイデッキのモーダルから「コピーして編集」でビルダーに複製を渡す（元デッキは残る）', () => {
    const base = (engine.DECKS as any[])[0];
    act(() => {
      engine.G.customDecks = [{ ...base, id: 'cloud-9', name: '複製元デッキ', cloud: true, shared: true }];
      useEngineStore.setState({ builderOpen: false, builderDeck: null });
      useEngineStore.getState().bump();
    });
    render(<Decks />, '/decks');
    const card = Array.from(document.querySelectorAll('.deck-card')).find((c) => (c.textContent || '').includes('複製元デッキ'))!;
    act(() => { fireEvent.click(card); });
    const btn = Array.from(document.querySelectorAll('.modal button')).find((b) => b.textContent === 'コピーして編集') as HTMLButtonElement;
    expect(btn).toBeTruthy();          // クラウドデッキにも複製導線がある（従来は「編集」のみ）
    act(() => { fireEvent.click(btn); });

    // ビルダーへ渡るのは cloud/id を落とした複製＝上書き保存にならない（新規保存になる）
    const bd = useEngineStore.getState().builderDeck as any;
    expect(useEngineStore.getState().builderOpen).toBe(true);
    expect(bd).toBeTruthy();
    expect(bd.cloud).toBeUndefined();
    expect(bd.id).toBeUndefined();
    expect(bd.name).toBe('複製元デッキ');
    expect(bd.leader).toBe(base.leader);
    expect(bd.list).toEqual(base.list);
    // 元のデッキは customDecks に残ったまま
    expect((engine.G.customDecks as any[]).map((d) => d.id)).toContain('cloud-9');
    act(() => { engine.G.customDecks = []; useEngineStore.setState({ builderOpen: false, builderDeck: null }); useEngineStore.getState().bump(); });
  });
});

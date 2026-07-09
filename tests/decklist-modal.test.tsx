// @vitest-environment happy-dom
// デッキ選択画面の「📋 カードリスト」ボタン→カードリスト画像モーダルの回帰テスト。
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render as rtlRender, cleanup, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { createEngine } from '../src/engine/bootstrap';
import { headlessAdapter } from '../src/engine/ui-adapter';
import { useEngineStore } from '../src/state/engineStore';
import DeckSelect from '../src/screens/DeckSelect';

// DeckSelect はルーター配下で動く（useNavigate）ため MemoryRouter で包む
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

let engine: any;

beforeAll(() => {
  // 対戦は開始しない（DeckSelect は DECKS/C だけ要る）。store に engine を流し込む。
  engine = createEngine({ ui: headlessAdapter(), timers: 'immediate', aiOn: false });
  act(() => {
    useEngineStore.setState({ engine, version: 1, prompt: null, pick: null, atk: null, end: null, fxQueue: [], thinking: false });
  });
});

afterEach(() => cleanup());

const listBtns = () =>
  Array.from(document.querySelectorAll('button')).filter((b) => (b.textContent || '').includes('カードリスト'));

describe('DeckSelect カードリストモーダル', () => {
  it('カルーセルに全デッキが並び、中央デッキ用の「カードリスト」ボタンが1つ出る', () => {
    render(<DeckSelect />);
    const decks = (engine.DECKS || []).length;
    expect(decks).toBeGreaterThanOrEqual(9); // 組み込み7 + 新規2
    // v2: グリッド2回ではなくカルーセル1本（.dsc-item がデッキ数分）＋アクティブデッキのメタ行に「カードリスト」1つ
    expect(document.querySelectorAll('.dsc-item').length).toBe(decks);
    expect(listBtns().length).toBe(1);
  });

  it('ボタン押下でモーダルが開き、カード画像（公式画像URL）と合計枚数が表示される', () => {
    render(<DeckSelect />);
    act(() => { fireEvent.click(listBtns()[0]); });

    expect(document.querySelector('.modal-back')).toBeTruthy();
    expect(document.body.textContent).toContain('リーダー：');
    expect(document.body.textContent).toContain('合計');

    const imgs = document.querySelectorAll('.modal .dl-grid .dl-thumb img');
    expect(imgs.length).toBeGreaterThan(3); // 複数のカード画像
    expect((imgs[0] as HTMLImageElement).src).toContain('onepiece-cardgame.com'); // 公式カード画像
  });

  it('モーダル内カードをタップで拡大→再タップで元に戻る', () => {
    render(<DeckSelect />);
    act(() => { fireEvent.click(listBtns()[0]); }); // モーダルを開く

    const thumb = document.querySelector('.dl-thumb');
    expect(thumb).toBeTruthy();
    const zoom = () => document.querySelector('.card-zoom-back');
    expect(zoom()).toBeFalsy(); // 拡大前はオーバーレイなし

    // タップ→拡大オーバーレイ（キャッシュ済みサムネを即表示、裏で高画質を先読み）
    act(() => { fireEvent.click(thumb!); });
    expect(zoom()).toBeTruthy();
    expect(zoom()!.querySelector('img')).toBeTruthy(); // 画像が即出る

    // 拡大表示を再タップ→元に戻る
    act(() => { fireEvent.click(zoom()!); });
    expect(zoom()).toBeFalsy();
  });

  it('新デッキ 青緑ルフィ のモーダルにリーダー名と50枚が出る', () => {
    render(<DeckSelect />);
    // v2: カルーセルの「青緑ルフィ」をクリックして中央（アクティブ）にし、メタ行のカードリストを押す
    const items = Array.from(document.querySelectorAll('.dsc-item'));
    const luffyItem = items.find((c) => (c.textContent || '').includes('青緑ルフィ'));
    expect(luffyItem).toBeTruthy();
    act(() => { fireEvent.click(luffyItem!); });
    const btn = listBtns()[0];
    expect(btn).toBeTruthy();
    act(() => { fireEvent.click(btn); });

    // モーダル内にのみ出る情報で判定（画面のデッキ説明文には「モンキー・Ｄ・ルフィ」は無い）
    expect(document.body.textContent).toContain('モンキー・Ｄ・ルフィ'); // OP16-022 リーダー名
    expect(document.body.textContent).toContain('合計 50');
    expect(document.body.textContent).toContain('×8'); // インペルダウンの囚人 ×8 の枚数バッジ
  });
});

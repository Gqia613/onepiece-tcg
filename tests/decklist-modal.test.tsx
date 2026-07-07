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
  it('各デッキカードに「📋 カードリスト」ボタンが出る（me/cpu 両グリッド分）', () => {
    render(<DeckSelect />);
    const decks = (engine.DECKS || []).length;
    expect(decks).toBeGreaterThanOrEqual(9); // 組み込み7 + 新規2
    // 2グリッド（あなた/CPU）に各デッキ分＝decks*2
    expect(listBtns().length).toBe(decks * 2);
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
    const big = () => Array.from(document.querySelectorAll('img')).find((im) => (im as HTMLImageElement).src.includes('w=640'));
    expect(big()).toBeFalsy(); // 拡大前は w=640 画像なし

    // タップ→拡大（高解像度 w=640 の画像が中央オーバーレイに出る）
    act(() => { fireEvent.click(thumb!); });
    expect(big()).toBeTruthy();

    // 拡大表示を再タップ→元に戻る（w=640 画像が消える）
    act(() => { fireEvent.click(big()!.parentElement!); });
    expect(big()).toBeFalsy();
  });

  it('新デッキ 青緑ルフィ のモーダルにリーダー名と50枚が出る', () => {
    render(<DeckSelect />);
    // 「青緑ルフィ」デッキカード内のカードリストボタンを押す（ボタンは tier 昇順ソート済＝DECKS順とは別）
    const cards = Array.from(document.querySelectorAll('.deck-card'));
    const luffyCard = cards.find((c) => (c.textContent || '').includes('青緑ルフィ'));
    expect(luffyCard).toBeTruthy();
    const btn = Array.from(luffyCard!.querySelectorAll('button')).find((b) => (b.textContent || '').includes('カードリスト'))!;
    act(() => { fireEvent.click(btn); });

    // モーダル内にのみ出る情報で判定（画面のデッキ説明文には「モンキー・Ｄ・ルフィ」は無い）
    expect(document.body.textContent).toContain('モンキー・Ｄ・ルフィ'); // OP16-022 リーダー名
    expect(document.body.textContent).toContain('合計 50');
    expect(document.body.textContent).toContain('×8'); // インペルダウンの囚人 ×8 の枚数バッジ
  });
});

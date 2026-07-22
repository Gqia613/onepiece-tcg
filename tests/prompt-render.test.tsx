// @vitest-environment happy-dom
// ★不変条件: 「自席のプロンプトがストアにあるなら、必ず #promptHost に選択UIが出ている」。
// これが破れると相手のアタックに対する防御（ブロック→カウンター）で操作先が消え、
// 「あなたの操作待ち」のままゲームが進行不能になる（実際に発生: framer-motion の AnimatePresence が
// 退場アニメ完了時に「前回コミット時点の子」を書き戻すため、退場と新プロンプトの入場が同着すると
// 描画が空になった）。→ Prompt は AnimatePresence を使わずストアの純関数として描画する。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Prompt } from '../src/components/fx/Prompt';
import { useEngineStore } from '../src/state/engineStore';
import { useNetStore } from '../src/state/netStore';
import type { PromptState } from '../src/engine/types';

const at = (path: string) => (ui: React.ReactElement) =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

const mkPrompt = (id: number, side: 'me' | 'cpu', cls = 'defense'): PromptState =>
  ({ id, side, cls, local: false, title: 'テスト', text: '', opts: [{ t: 'OK', v: 'ok' }], onPick: () => {} }) as any;

const setPrompt = (p: PromptState | null) => act(() => { useEngineStore.getState().setPrompt(p); });

beforeEach(() => {
  act(() => {
    useEngineStore.setState({ prompt: null, promptPeek: false, pick: null, trigger: null, atk: null });
    useNetStore.setState({ mode: 'online', mySeat: 'me', replayActive: false, earlyMulligan: null } as any);
  });
});
afterEach(() => cleanup());

describe('Prompt の描画不変条件', () => {
  it('自席のプロンプトがあれば必ずモーダルが出る（退場アニメの窓と入場が重なっても消えない）', () => {
    at('/battle/play')(<Prompt />);
    // ブロック選択 → 解決(null) → カウンターが「退場アニメ相当の間隔(0〜300ms)」を空けて出る、を総当たり
    for (const gap of [0, 100, 160, 190, 200, 220, 300]) {
      setPrompt(mkPrompt(gap * 10 + 1, 'me'));
      expect(document.querySelector('#promptHost .prompt.show')).toBeTruthy();
      setPrompt(null);
      expect(document.querySelector('#promptHost .prompt.show')).toBeFalsy();
      setPrompt(mkPrompt(gap * 10 + 2, 'me')); // カウンタープロンプト
      expect(document.querySelector('#promptHost .prompt.show')).toBeTruthy(); // ★ここが消えると進行不能
    }
  });

  it('自席のプロンプト中に #promptHost が空にならない（退避中は「選択にもどる」が出る）', () => {
    at('/battle/play')(<Prompt />);
    // カード選択肢を持つプロンプト＝「盤面/手札を見る」退避が可能（canPeek）
    const p = { ...mkPrompt(1, 'me'), opts: [{ t: 'ロー', v: 'c0', card: { no: 'OP13-031' } }] } as any;
    setPrompt(p);
    expect(document.querySelector('#promptHost .prompt.show')).toBeTruthy();
    act(() => { useEngineStore.getState().setPromptPeek(true); });
    // 退避中はモーダルの代わりに必ず復帰ボタンが出る（＝操作先がゼロにならない）
    expect(document.querySelector('#promptHost .peek-back')).toBeTruthy();
  });

  it('相手席のプロンプトは選択UIを出さず「選択待ち」を出す（オンラインの回帰）', () => {
    at('/battle/play')(<Prompt />);
    setPrompt(mkPrompt(1, 'cpu'));
    expect(document.querySelector('#promptHost .prompt.waiting')).toBeTruthy();
    expect(document.querySelector('#promptHost .opts')).toBeFalsy();
  });

  it('盤面以外の画面ではモーダルを出さない（残留させない）', () => {
    at('/')(<Prompt />);
    setPrompt(mkPrompt(1, 'me'));
    expect(document.querySelector('#promptHost .prompt.show')).toBeFalsy();
  });

  it('reveal付きプロンプトはカードを大写しで描画する（見る効果=完了/選択まで表示）', () => {
    at('/battle/play')(<Prompt />);
    const p = { ...mkPrompt(1, 'me', ''), reveal: { no: 'OP15-067', name: 'テスト猫' }, opts: [{ t: '完了', v: 'ok', primary: true }] } as any;
    setPrompt(p);
    const img = document.querySelector('#promptHost .prompt-reveal img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src') || '').toContain('OP15-067');
    expect(document.querySelector('#promptHost .prompt-reveal .pr-name')?.textContent).toContain('テスト猫');
  });

  it('相手席のプロンプトの reveal は描画しない（相手デッキ上/ライフの情報漏洩を防ぐ）', () => {
    at('/battle/play')(<Prompt />);
    const p = { ...mkPrompt(1, 'cpu'), reveal: { no: 'OP15-067', name: 'ひみつ' } } as any;
    setPrompt(p);
    expect(document.querySelector('#promptHost .prompt-reveal')).toBeFalsy();
    expect(document.querySelector('#promptHost .prompt.waiting')).toBeTruthy();
  });
});

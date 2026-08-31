// @vitest-environment happy-dom
// 「OFFなのに鳴る／バックグラウンドで再生され続ける」の回帰テスト。
// audio.ts はモジュール内シングルトン状態なので、ケースごとに resetModules + 動的 import する。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Log = string[];
let log: Log = [];

class FakeNode {
  connect() { return this as any; }
  disconnect() { /* noop */ }
}
class FakeAudioCtx {
  state = 'running';
  currentTime = 0;
  destination = new FakeNode();
  createGain() { return Object.assign(new FakeNode(), { gain: { value: 0 } }) as any; }
  createOscillator() {
    log.push('osc');
    return Object.assign(new FakeNode(), {
      type: 'sine', frequency: { setValueAtTime() { /* noop */ } },
      start() { /* noop */ }, stop() { /* noop */ },
    }) as any;
  }
  createBuffer() { return {} as any; }
  createBufferSource() {
    log.push('keepalive');
    return Object.assign(new FakeNode(), { buffer: null, loop: false, start() { /* noop */ }, stop() { /* noop */ } }) as any;
  }
  createMediaElementSource() { return new FakeNode() as any; }
  resume() { this.state = 'running'; log.push('resume'); return Promise.resolve(); }
  suspend() { this.state = 'suspended'; log.push('suspend'); return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
class FakeAudio {
  paused = true; src = ''; loop = false; preload = ''; volume = 1; currentTime = 0;
  play() { this.paused = false; log.push('play'); return Promise.resolve(); }
  pause() { this.paused = true; log.push('pause'); }
  removeAttribute() { /* noop */ }
  load() { /* noop */ }
}

beforeEach(() => {
  log = [];
  vi.resetModules();
  vi.useFakeTimers();
  (globalThis as any).AudioContext = FakeAudioCtx;
  (globalThis as any).Audio = FakeAudio;
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});
afterEach(() => { vi.useRealTimers(); });

const load = () => import('../src/audio');

describe('audio: OFF のときは鳴らさない／セッションを持たない', () => {
  it('BGM ON なら盤面入場で再生する', async () => {
    const a = await load();
    a.unlockAudio();
    a.startBgm('/bgm/battle.mp3');
    expect(log).toContain('play');
  });

  it('BGM OFF では startBgm しても再生しない（曲だけ覚える）', async () => {
    const a = await load();
    a.unlockAudio();
    a.setBgmEnabled(false);
    a.startBgm('/bgm/battle.mp3');
    expect(log).not.toContain('play');
    // ON に戻したらその曲が鳴り出す
    a.setBgmEnabled(true);
    expect(log).toContain('play');
  });

  it('再生中に BGM を OFF にしたら要素ごと止める（gain0で鳴らし続けない）', async () => {
    const a = await load();
    a.unlockAudio();
    a.startBgm('/bgm/battle.mp3');
    log = [];
    a.setBgmEnabled(false);
    expect(log).toContain('pause');
  });

  it('効果音もBGMもOFFなら AudioContext ごと停止する（無音キープアライブも止める）', async () => {
    const a = await load();
    a.unlockAudio();
    expect(log).toContain('keepalive'); // 通常はセッション維持のため無音ループを鳴らす
    a.setBgmEnabled(false);
    a.setAudioMuted(true);
    expect(log).toContain('suspend');
    // 全OFF中は次のユーザー操作でもセッションを起こさない
    log = [];
    a.unlockAudio();
    expect(log).not.toContain('resume');
    expect(log).not.toContain('keepalive');
  });

  it('効果音は OFF・非表示中は鳴らさない（復帰時の一斉発音を防ぐ）', async () => {
    const a = await load();
    a.unlockAudio();
    a.playSfx('click');
    expect(log).toContain('osc');

    log = [];
    a.setAudioMuted(true);
    a.playSfx('click');
    expect(log).not.toContain('osc');

    log = [];
    a.setAudioMuted(false);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    a.playSfx('click');
    expect(log).not.toContain('osc');
  });
});

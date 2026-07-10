// WebAudio 合成効果音（src/40-ui-render.js:63-92 SFX を忠実移植）。
// ファイルは持たず oscillator 合成。最初のユーザー操作で unlockAudio()。
let ctx: AudioContext | null = null;
let muted = false;
let unlocked = false;

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      ctx = AC ? new AC() : null;
    } catch {
      ctx = null;
    }
  }
  return ctx;
}

// 再生ごとのピッチ係数（±5%）。同じSEの連打が機械的に聞こえないようにする（ゲームフィールの定石）。
// ジングル系（win/lose/reveal等）は音楽性を保つため 1.0 固定（playSfx が制御）。
let pitchF = 1;

function tone(freq: number, dur: number, type: OscillatorType, gain?: number, when?: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (when || 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq * pitchF, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain || 0.13, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.03);
}

const lib: Record<string, () => void> = {
  click: () => tone(420, 0.05, 'triangle', 0.06),
  summon: () => { tone(330, 0.12, 'triangle', 0.11); tone(495, 0.13, 'sine', 0.09, 0.06); },
  attack: () => { tone(190, 0.12, 'sawtooth', 0.11); tone(120, 0.15, 'square', 0.06, 0.04); },
  hit: () => tone(90, 0.18, 'square', 0.15),
  ko: () => { tone(160, 0.2, 'sawtooth', 0.13); tone(80, 0.28, 'square', 0.11, 0.07); },
  block: () => { tone(620, 0.09, 'sine', 0.1); tone(780, 0.11, 'sine', 0.07, 0.05); },
  counter: () => tone(540, 0.1, 'triangle', 0.09),
  draw: () => { tone(520, 0.07, 'sine', 0.07); tone(680, 0.08, 'sine', 0.06, 0.05); },
  don: () => tone(300, 0.08, 'triangle', 0.09),
  trigger: () => { tone(700, 0.1, 'sine', 0.1); tone(950, 0.12, 'sine', 0.08, 0.06); },
  // トリガー公開の演出音（溜め→上昇アルペジオ→高音キラーン）。
  reveal: () => {
    tone(180, 0.18, 'sawtooth', 0.05);
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.09, 0.1 + i * 0.07));
    tone(1319, 0.5, 'sine', 0.08, 0.42);
    tone(1976, 0.4, 'sine', 0.05, 0.5);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.13, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.34, 'sine', 0.11, i * 0.14)),
  // 自分のターン開始ジングル（短い上昇2音・控えめ）
  turnstart: () => { tone(587, 0.09, 'triangle', 0.08); tone(880, 0.14, 'sine', 0.07, 0.07); },
  // レア（SR）登場: きらめく上昇3音
  summonRare: () => [659, 880, 1319].forEach((f, i) => tone(f, 0.14, 'sine', 0.08, i * 0.06)),
  // 主役級（SEC/L相当）登場: 溜め→輝きの和音
  summonSec: () => { tone(220, 0.16, 'sawtooth', 0.06); [523, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, 0.12 + i * 0.05)); tone(1568, 0.4, 'sine', 0.06, 0.3); },
  // リーサル（トドメ）: 低音ブーム＋高音スティング
  finish: () => { tone(60, 0.5, 'square', 0.16); tone(120, 0.3, 'sawtooth', 0.1, 0.02); tone(1760, 0.5, 'sine', 0.07, 0.16); },
};

// ピッチ固定で鳴らすジングル系（音楽的なフレーズはデチューンしない）
const STABLE = new Set(['reveal', 'win', 'lose', 'turnstart', 'summonRare', 'summonSec', 'finish']);

export function unlockAudio() {
  unlocked = true;
  const c = ac();
  if (c && c.state === 'suspended') { try { c.resume(); } catch { /* ignore */ } }
  ensureBgmEl(); // 最初のユーザー操作でBGM要素も準備（自動再生アンロック）
}

export function playSfx(name: string) {
  if (!unlocked || muted) return;
  // ★BGM(HTMLAudio)を止めた後などに AudioContext が suspended になると SE が無音になる
  //   （特にiOS: WebAudioとHTMLMediaElementがオーディオ出力を共有し、BGM停止で出力が休止）。
  //   再生のたびに suspended を検知して resume＝自己修復（BGM ON/OFF と SE は独立を保証）。
  const c = ac();
  if (c && c.state === 'suspended') { try { c.resume(); } catch { /* ignore */ } }
  pitchF = STABLE.has(name) ? 1 : 0.95 + Math.random() * 0.1; // ±5%
  try { (lib[name] || (() => {}))(); } catch { /* ignore */ }
  pitchF = 1;
}

// ハプティクス（対応端末のみ・非対応/拒否は無視）。演出のクライマックスで短く使う。
export function buzz(pattern: number | number[]) {
  try { (navigator as any).vibrate?.(pattern); } catch { /* ignore */ }
}

export function setAudioMuted(m: boolean) { muted = m; }
export function isAudioMuted() { return muted; }

// ── BGM（ループ音源。HTMLAudioElement＝SE用のWeb Audioとは独立チャンネル）──
let bgmEl: HTMLAudioElement | null = null;
let bgmVol = 0.4;          // 目標音量（0..1）
let curSrc = '';           // 再生中/指定中の src
let fadeTimer: number | null = null;

function ensureBgmEl(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!bgmEl) {
    bgmEl = new Audio();
    bgmEl.loop = true;
    bgmEl.preload = 'auto';
    bgmEl.volume = 0;
  }
  return bgmEl;
}

function clearFade() {
  if (fadeTimer != null) { clearInterval(fadeTimer); fadeTimer = null; }
}

// el.volume を target まで ms かけて段階変化。完了時 onDone。
function fadeTo(target: number, ms: number, onDone?: () => void) {
  const el = bgmEl;
  if (!el) return;
  clearFade();
  const from = el.volume;
  const steps = Math.max(1, Math.round(ms / 40));
  let i = 0;
  fadeTimer = window.setInterval(() => {
    i++;
    const v = from + (target - from) * (i / steps);
    try { el.volume = Math.max(0, Math.min(1, v)); } catch { /* ignore */ }
    if (i >= steps) { clearFade(); if (onDone) onDone(); }
  }, 40);
}

// 指定srcのBGMをフェードインで再生。同じ曲を再生中なら何もしない（連続呼び出し安全）。
export function startBgm(src: string) {
  const el = ensureBgmEl();
  if (!el) return;
  if (curSrc === src && !el.paused) return;
  curSrc = src;
  try {
    el.src = src;
    el.volume = 0;
    const p = el.play();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => { /* 自動再生拒否は無視（次のユーザー操作で再試行） */ });
    }
    fadeTo(bgmVol, 800);
  } catch { /* ignore */ }
}

// BGM停止。fade:true でフェードアウトしてから pause。
export function stopBgm(opts?: { fade?: boolean }) {
  const el = bgmEl;
  curSrc = '';
  if (!el) return;
  if (opts && opts.fade) {
    fadeTo(0, 600, () => { try { el.pause(); el.currentTime = 0; } catch { /* ignore */ } });
  } else {
    clearFade();
    try { el.pause(); el.currentTime = 0; el.volume = 0; } catch { /* ignore */ }
  }
}

// BGM音量（0..1）を設定。再生中は即時反映（進行中フェードは打ち切り）。
export function setBgmVolume(v: number) {
  bgmVol = Math.max(0, Math.min(1, v));
  const el = bgmEl;
  if (el && curSrc && !el.paused) { clearFade(); try { el.volume = bgmVol; } catch { /* ignore */ } }
}

export function getBgmVolume() { return bgmVol; }

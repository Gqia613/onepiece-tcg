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

// ★iOSキープアライブ: 無音バッファをループで鳴らし続け、AudioContextの
//   オーディオセッションを常にアクティブに保つ。iOSは resume() がユーザー操作
//   なしでは効かないため「落とさない」ことが唯一確実。BGM停止でもSEが死なない。
let keepAlive: AudioBufferSourceNode | null = null;
function startKeepAlive() {
  const c = ac();
  if (!c || keepAlive) return;
  try {
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * 0.5)), c.sampleRate); // 0.5秒の無音
    keepAlive = c.createBufferSource();
    keepAlive.buffer = buf;
    keepAlive.loop = true;
    keepAlive.connect(c.destination);
    keepAlive.start(0);
  } catch { keepAlive = null; }
}

export function unlockAudio() {
  unlocked = true;
  const c = ac();
  if (c && c.state !== 'running') { try { c.resume(); } catch { /* ignore */ } }
  ensureBgmEl(); // 最初のユーザー操作でBGM要素も準備（自動再生アンロック）
  routeBgm();    // BGMをAudioContextのグラフに接続（SEとセッション統合＝BGM停止でSEが死なない）
  startKeepAlive(); // 無音音源でセッションを常時アクティブに保つ
}

export function playSfx(name: string) {
  if (!unlocked || muted) return;
  // suspended/interrupted なら復帰を試みる（保険。iOSでは操作なしだと効かないことがあるため
  //   本命は startKeepAlive によるセッション維持）。
  const c = ac();
  if (c && c.state !== 'running') { try { c.resume(); } catch { /* ignore */ } }
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

// ── BGM（ループ音源）──
// ★重要（iOS対策）: HTMLAudioElement を pause するとオーディオ出力セッションが切れ、
//   別チャンネルの WebAudio(SE) まで無音になる端末がある。これを避けるため BGM も
//   同じ AudioContext のグラフ（MediaElementSource → gain → destination）に通し、
//   SE と1つの出力へ統合する（セッション共有＝BGM停止でも SE は生き続ける）。
//   音量も gain で制御（iOS は el.volume を無視するため BGM音量調整もこれで有効化）。
let bgmEl: HTMLAudioElement | null = null;
let bgmSource: MediaElementAudioSourceNode | null = null;
let bgmGain: GainNode | null = null;
let bgmVol = 0.4;          // 目標音量（0..1）
let bgmEnabled = true;     // 可聴(true)/消音(false)。★要素は止めず gain で制御（iOSでpauseするとSEが死ぬため）
let curSrc = '';           // 再生中/指定中の src
let fadeTimer: number | null = null;

function ensureBgmEl(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!bgmEl) {
    bgmEl = new Audio();
    bgmEl.loop = true;
    bgmEl.preload = 'auto';
    bgmEl.volume = 1; // 実音量は gain（無ければフォールバックで el.volume）で制御
  }
  return bgmEl;
}

// BGM を AudioContext のグラフに接続（1回だけ）。context/element が揃った後に呼ぶ。
// 非対応/失敗時は bgmGain=null のまま＝el.volume フォールバックで動く。
function routeBgm() {
  const c = ac();
  const el = ensureBgmEl();
  if (!c || !el || bgmSource) return;
  try {
    bgmSource = c.createMediaElementSource(el); // 同一オリジンの /bgm/*.mp3 ＝汚染なし
    bgmGain = c.createGain();
    bgmGain.gain.value = 0; // 開始は無音（startBgm でフェードイン）
    bgmSource.connect(bgmGain);
    bgmGain.connect(c.destination);
    el.volume = 1;
  } catch { bgmSource = null; bgmGain = null; }
}

// 現在音量取得 / 適用（gain 優先・無ければ el.volume）
function bgmLevel(): number {
  if (bgmGain) return bgmGain.gain.value;
  return bgmEl ? bgmEl.volume : 0;
}
function applyBgmLevel(v: number) {
  const x = Math.max(0, Math.min(1, v));
  if (bgmGain) { try { bgmGain.gain.value = x; } catch { /* ignore */ } }
  else if (bgmEl) { try { bgmEl.volume = x; } catch { /* ignore */ } }
}

function clearFade() {
  if (fadeTimer != null) { clearInterval(fadeTimer); fadeTimer = null; }
}

// 音量を target まで ms かけて段階変化。完了時 onDone。
function fadeTo(target: number, ms: number, onDone?: () => void) {
  if (!bgmEl) return;
  clearFade();
  const from = bgmLevel();
  const steps = Math.max(1, Math.round(ms / 40));
  let i = 0;
  fadeTimer = window.setInterval(() => {
    i++;
    applyBgmLevel(from + (target - from) * (i / steps));
    if (i >= steps) { clearFade(); if (onDone) onDone(); }
  }, 40);
}

// 指定srcのBGMを再生（要素は盤面中ずっと再生し続ける＝セッション維持）。
// 可聴かどうかは bgmEnabled（gain）で制御。同じ曲を再生中なら何もしない。
export function startBgm(src: string) {
  const el = ensureBgmEl();
  if (!el) return;
  routeBgm(); // AudioContext のグラフへ接続（unlock 後。SE とセッション統合）
  if (curSrc === src && !el.paused) { fadeTo(bgmEnabled ? bgmVol : 0, 400); return; }
  curSrc = src;
  try {
    el.src = src;
    applyBgmLevel(0);
    const p = el.play();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => { /* 自動再生拒否は無視（次のユーザー操作で再試行） */ });
    }
    fadeTo(bgmEnabled ? bgmVol : 0, 800); // OFFなら無音のまま再生（要素は動かしてセッション維持）
  } catch { /* ignore */ }
}

// BGMの可聴/消音を切り替える。★要素は止めない（pauseするとiOSでSEも無音になるため）。
// gain のフェードだけで音を消す＝オーディオセッションは生き続け、SEは影響を受けない。
export function setBgmEnabled(on: boolean) {
  bgmEnabled = on;
  const el = bgmEl;
  if (el && !el.paused) { clearFade(); fadeTo(on ? bgmVol : 0, on ? 500 : 350); }
}

// BGM停止。fade:true でフェードアウトしてから pause。
// ★element の pause だけ（context は running のまま）＝SE は影響を受けない。
export function stopBgm(opts?: { fade?: boolean }) {
  const el = bgmEl;
  curSrc = '';
  if (!el) return;
  if (opts && opts.fade) {
    fadeTo(0, 600, () => { try { el.pause(); el.currentTime = 0; } catch { /* ignore */ } });
  } else {
    clearFade();
    try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
    applyBgmLevel(0);
  }
}

// BGM音量（0..1）を設定。再生中は即時反映（進行中フェードは打ち切り）。
export function setBgmVolume(v: number) {
  bgmVol = Math.max(0, Math.min(1, v));
  const el = bgmEl;
  if (el && curSrc && !el.paused && bgmEnabled) { clearFade(); applyBgmLevel(bgmVol); } // 消音中は反映しない（無音を保つ）
}

export function getBgmVolume() { return bgmVol; }

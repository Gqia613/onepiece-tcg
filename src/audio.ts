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

function tone(freq: number, dur: number, type: OscillatorType, gain?: number, when?: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (when || 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
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
};

export function unlockAudio() {
  unlocked = true;
  const c = ac();
  if (c && c.state === 'suspended') { try { c.resume(); } catch { /* ignore */ } }
}

export function playSfx(name: string) {
  if (!unlocked || muted) return;
  try { (lib[name] || (() => {}))(); } catch { /* ignore */ }
}

export function setAudioMuted(m: boolean) { muted = m; }
export function isAudioMuted() { return muted; }

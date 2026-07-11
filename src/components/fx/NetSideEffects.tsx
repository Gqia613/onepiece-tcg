// オンライン対戦の副作用（UIなし）:
// - 手番通知: 自分の入力待ちになったとき、タブが非表示/非フォーカスなら 音＋タイトル点滅＋バイブ
// - Wake Lock: 対戦中は画面スリープを防止（対応ブラウザのみ・失敗は無視）
import { useEffect, useRef } from 'react';
import { useEngineStore } from '../../state/engineStore';
import { useNetStore } from '../../state/netStore';
import { playSfx, buzz } from '../../audio';

function myInputNeeded(): boolean {
  const net = useNetStore.getState();
  if (net.mode !== 'online' || net.phase !== 'playing' || net.desync || net.recovering) return false;
  const st = useEngineStore.getState();
  const eng = st.engine;
  if (!eng?.G?.inGame || eng.G.winner || eng.G._sim) return false;
  const p = st.prompt as any;
  if (p && !p.local) return (p.side || 'me') === net.mySeat;
  const G = eng.G;
  if (G.attackSel) return G.active === net.mySeat;
  return G.active === net.mySeat && !!G.myActable && !G.busy;
}

export function NetSideEffects() {
  const version = useEngineStore((s) => s.version);
  const prompt = useEngineStore((s) => s.prompt);
  const mode = useNetStore((s) => s.mode);
  const phase = useNetStore((s) => s.phase);
  const engine = useEngineStore((s) => s.engine);

  const wasNeeded = useRef(false);
  const blinkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const origTitle = useRef<string | null>(null);

  // ---- 手番通知 ----
  useEffect(() => {
    const needed = myInputNeeded();
    const away = typeof document !== 'undefined' && (document.hidden || !document.hasFocus());
    if (needed && !wasNeeded.current && away) {
      try { playSfx('turnstart'); } catch { /* ignore */ }
      try { buzz(60); } catch { /* ignore */ }
      if (!blinkTimer.current && typeof document !== 'undefined') {
        origTitle.current = document.title;
        let on = false;
        blinkTimer.current = setInterval(() => {
          on = !on;
          document.title = on ? '🔔 あなたの番！' : (origTitle.current || 'OPCG');
        }, 900);
      }
    }
    // 画面に戻った/入力待ちでなくなったら点滅解除
    if ((!needed || !away) && blinkTimer.current) {
      clearInterval(blinkTimer.current);
      blinkTimer.current = null;
      if (origTitle.current != null) { document.title = origTitle.current; origTitle.current = null; }
    }
    wasNeeded.current = needed;
  }, [version, prompt, mode, phase]);

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden && blinkTimer.current) {
        clearInterval(blinkTimer.current);
        blinkTimer.current = null;
        if (origTitle.current != null) { document.title = origTitle.current; origTitle.current = null; }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ---- Wake Lock（対戦中は画面を眠らせない）----
  const lockRef = useRef<any>(null);
  useEffect(() => {
    const inGame = !!engine?.G?.inGame;
    const want = inGame && (mode === 'online' ? phase === 'playing' : true);
    const acquire = async () => {
      try {
        if (!want || document.hidden || lockRef.current) return;
        const wl = (navigator as any).wakeLock;
        if (!wl?.request) return;
        lockRef.current = await wl.request('screen');
        lockRef.current.addEventListener?.('release', () => { lockRef.current = null; });
      } catch { /* 非対応/拒否は無視 */ }
    };
    const release = () => { try { lockRef.current?.release?.(); } catch { /* ignore */ } lockRef.current = null; };
    if (want) void acquire(); else release();
    const onVis = () => { if (!document.hidden && want) void acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); };
  }, [engine, version, mode, phase]);

  return null;
}

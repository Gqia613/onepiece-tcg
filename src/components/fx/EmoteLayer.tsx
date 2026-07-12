// 定型エモート（オンライン対戦のみ）。自由入力チャットは意図的に持たない。
// 送信: 左下の😊ボタン→8種から選択。受信: 相手側は盤面上部、自分は下部にバブル表示（2.6秒）。
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNetStore } from '../../state/netStore';
import { EMOTES } from '../../net/protocol';
import { sendEmote } from '../../net/onlineGame';

export function EmoteLayer() {
  const onPlay = useLocation().pathname === '/battle/play';
  const online = useNetStore((s) => s.mode) === 'online';
  const phase = useNetStore((s) => s.phase);
  const mySeat = useNetStore((s) => s.mySeat);
  const last = useNetStore((s) => s.lastEmote);
  const replay = useNetStore((s) => s.replayActive);
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState<{ mine: boolean; text: string; id: number } | null>(null);
  const coolRef = useRef(0);

  useEffect(() => {
    if (!last) return;
    setBubble({ mine: last.seat === mySeat, text: EMOTES[last.k] ?? '', id: last.id });
    const t = setTimeout(() => setBubble((b) => (b && b.id === last.id ? null : b)), 2600);
    return () => clearTimeout(t);
  }, [last, mySeat]);

  if (!onPlay) return null; // 盤面（/battle/play）以外では出さない（画面遷移後の残留防止・フックの後に判定）
  if (!online || replay || (phase !== 'playing' && phase !== 'ended')) return null;

  const pick = (i: number) => {
    const now = Date.now();
    if (now - coolRef.current < 1500) return; // 連打抑制（DO側にもレート制限あり）
    coolRef.current = now;
    sendEmote(i);
    setOpen(false);
  };

  return (
    <>
      {/* 送信ボタン＋パレット */}
      <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 62 }}>
        {open ? (
          <div style={{
            position: 'absolute', bottom: 40, left: 0, width: 210, padding: 8,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
            background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))',
            border: '1px solid var(--gold-dim)', borderRadius: 10, boxShadow: '0 12px 30px #000a',
          }}>
            {EMOTES.map((e, i) => (
              <button key={i} className="opt" style={{ padding: '7px 8px', fontSize: 12.5 }} onClick={() => pick(i)}>{e}</button>
            ))}
          </div>
        ) : null}
        <button
          aria-label="エモート"
          onClick={() => setOpen((o) => !o)}
          style={{
            width: 34, height: 34, borderRadius: 999, border: '1px solid var(--gold-dim)',
            background: 'rgba(10,22,34,0.92)', color: 'var(--gold-soft)', fontSize: 16, cursor: 'pointer',
          }}
        >😊</button>
      </div>

      {/* バブル */}
      <AnimatePresence>
        {bubble ? (
          <motion.div
            key={bubble.id}
            initial={{ opacity: 0, y: bubble.mine ? 10 : -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed', left: '50%', transform: 'translateX(-50%)',
              top: bubble.mine ? undefined : 92, bottom: bubble.mine ? 120 : undefined,
              zIndex: 62, padding: '8px 16px', borderRadius: 999, fontSize: 14, fontWeight: 700,
              background: bubble.mine ? 'rgba(24,50,72,0.95)' : 'rgba(50,30,60,0.95)',
              border: '1px solid var(--gold-dim)', color: 'var(--ink)', boxShadow: '0 8px 22px #0009',
              pointerEvents: 'none',
            }}
          >
            {bubble.text}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

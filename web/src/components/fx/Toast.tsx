// 中央トースト。元 src/40-ui-render.js の toast(95-99) を React+Framer で置換。
// store.fxQueue の type==='toast' を約1s表示して removeFx。
// 元は .float.buff を felt の中央(left:50%/top:44%)に出していた＝金色テキスト。
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import type { FxEvent } from '../../engine/types';

type ToastItem = { id: number; text: string };

export function Toast() {
  const fxQueue = useEngineStore((s) => s.fxQueue);
  const removeFx = useEngineStore((s) => s.removeFx);

  const seen = useRef<Set<number>>(new Set());
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    for (const f of fxQueue) {
      if (seen.current.has(f.id)) continue;
      if (f.type === 'toast') {
        seen.current.add(f.id);
        setItems((cur) => [...cur, { id: f.id, text: f.text }]);
        removeFx(f.id);
      }
    }
    if (seen.current.size > 128) {
      const live = new Set(fxQueue.map((e: FxEvent) => e.id));
      for (const id of seen.current) if (!live.has(id)) seen.current.delete(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxQueue]);

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        top: '44%',
        transform: 'translateX(-50%)',
        zIndex: 9150,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {items.map((it) => (
          <ToastOne key={it.id} item={it} onDone={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastOne({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  // 元 toast は 1000ms で remove。表示後にタイマーで exit を発火。
  useEffect(() => {
    const t = setTimeout(onDone, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.85 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{
        position: 'static',
        transform: 'none',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        fontFamily: "'Noto Sans JP'",
        fontSize: 13.5,
        fontWeight: 700,
        color: '#f5d98a', // 元 .float.buff = --gold-soft
        textShadow: '0 2px 6px #000',
      }}
    >
      {item.text}
    </motion.div>
  );
}

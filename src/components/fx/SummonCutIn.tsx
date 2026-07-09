// 主役級カード（SEC/SP）登場のミニカットイン。reactAdapter の spawnAt(ring) 昇格から
// fxQueue（type:'sumcut'）で届く。非ブロッキング・約1.1秒で自動消滅・操作は透過。
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG_BIG, IMG_RAW } from '../../engine/img';

type Item = { id: number; no: string; name: string };

export function SummonCutIn() {
  const fxQueue = useEngineStore((s) => s.fxQueue);
  const removeFx = useEngineStore((s) => s.removeFx);
  const seen = useRef<Set<number>>(new Set());
  const [item, setItem] = useState<Item | null>(null);

  useEffect(() => {
    for (const f of fxQueue) {
      if (f.type !== 'sumcut' || seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      removeFx(f.id);
      setItem({ id: f.id, no: f.no, name: f.name });
      const t = setTimeout(() => setItem((cur) => (cur && cur.id === f.id ? null : cur)), 1100);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxQueue]);

  return (
    <AnimatePresence>
      {item ? (
        <motion.div
          key={item.id}
          className="sum-cut"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
        >
          <motion.img
            src={IMG_BIG(item.no)}
            referrerPolicy="no-referrer"
            decoding="async"
            alt={item.name}
            initial={{ x: 90, rotate: 10, scale: 0.8 }}
            animate={{ x: 0, rotate: 4, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = IMG_RAW(item.no); } }}
          />
          <div className="sc-name">{item.name}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

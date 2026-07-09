// 主役級カード（SEC/SP）登場のカットイン。reactAdapter の spawnAt(ring) 昇格から
// fxQueue（type:'sumcut'）で届く。非ブロッキング・約1.4秒で自動消滅・操作は透過。
// 演出: 金フラッシュ → 放射光が回る中へカードが叩きつけられる（着地で画面シェイク）
//       → 衝撃波リング＋金粒子バースト → 名前バナー。
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG_BIG, IMG_RAW } from '../../engine/img';

type Item = { id: number; no: string; name: string };

const HOLD_MS = 1400;

export function SummonCutIn() {
  const fxQueue = useEngineStore((s) => s.fxQueue);
  const removeFx = useEngineStore((s) => s.removeFx);
  const seen = useRef<Set<number>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [item, setItem] = useState<Item | null>(null);

  // ★消滅タイマーは ref で管理する。effect の return でクリーンアップすると、
  //   直後の removeFx による fxQueue 変化で effect が再実行され、タイマーが
  //   解除されてカットインが出っぱなしになる（実バグ）。解除は unmount 時のみ。
  useEffect(() => {
    for (const f of fxQueue) {
      if (f.type !== 'sumcut' || seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      removeFx(f.id);
      setItem({ id: f.id, no: f.no, name: f.name });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; setItem(null); }, HOLD_MS);
      // カード着地の瞬間に画面シェイク（既存 .felt.quake を再利用・自動除去）
      setTimeout(() => {
        const felt = document.querySelector('.felt');
        if (felt) { felt.classList.remove('quake'); void (felt as HTMLElement).offsetWidth; felt.classList.add('quake'); }
        setTimeout(() => document.querySelector('.felt')?.classList.remove('quake'), 480);
      }, 170);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxQueue]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <AnimatePresence>
      {item ? (
        <motion.div
          key={item.id}
          className="sum-cut"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {/* 開幕フラッシュ＋回転する放射光（カード背面） */}
          <div className="sc-flash" />
          <div className="sc-stage">
            <div className="sc-rays" />
            <motion.img
              src={IMG_BIG(item.no)}
              referrerPolicy="no-referrer"
              decoding="async"
              alt={item.name}
              initial={{ x: 340, rotate: 24, scale: 1.5, opacity: 0 }}
              animate={{ x: 0, rotate: 4, scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 560, damping: 17, mass: 0.9 }}
              onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = IMG_RAW(item.no); } }}
            />
            {/* 着地の衝撃波リング＋金粒子バースト */}
            <div className="sc-ring" />
            <div className="sc-parts" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ ['--a' as any]: (i * 36 + 8) + 'deg', ['--d' as any]: (90 + (i % 3) * 34) + 'px' }} />
              ))}
            </div>
            <motion.div
              className="sc-name"
              initial={{ x: 60, opacity: 0, scale: 1.3 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 480, damping: 20, delay: 0.12 }}
            >
              {item.name}
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// 主役級カード（SEC/SP）登場のカットイン。reactAdapter の spawnAt(ring) 昇格から
// fxQueue（type:'sumcut'）で届く。非ブロッキング・操作は透過。
// 演出: 金フラッシュ → 放射光が回る中へカードが叩きつけられる（着地で画面シェイク）
//       → 衝撃波リング＋金粒子バースト → 名前バナー → フェードアウト。
//
// ★消滅の設計: 外枠の opacity をキーフレーム（出現→保持→消滅）で1本のアニメとして再生し、
//   onAnimationComplete で state を落とす。表示と消滅が同一パイプラインなので
//   「タイマーが他のfxイベントで解除されて出っぱなし」系の競合が構造的に起きない。
//   万一アニメ完了が来ない環境向けに 2.6s のフォールバックタイマー（item keyed）も持つ。
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG_BIG, IMG_RAW } from '../../engine/img';

type Item = { id: number; no: string; name: string };

export function SummonCutIn() {
  const fxQueue = useEngineStore((s) => s.fxQueue);
  const removeFx = useEngineStore((s) => s.removeFx);
  const seen = useRef<Set<number>>(new Set());
  const [item, setItem] = useState<Item | null>(null);

  // キューから sumcut を1度だけ取り込む（消滅はここでは扱わない）
  useEffect(() => {
    for (const f of fxQueue) {
      if (f.type !== 'sumcut' || seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      removeFx(f.id);
      setItem({ id: f.id, no: f.no, name: f.name });
      // カード着地の瞬間に画面シェイク（既存 .felt.quake を再利用・自動除去）
      setTimeout(() => {
        const felt = document.querySelector('.felt');
        if (felt) { felt.classList.remove('quake'); void (felt as HTMLElement).offsetWidth; felt.classList.add('quake'); }
        setTimeout(() => document.querySelector('.felt')?.classList.remove('quake'), 480);
      }, 170);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxQueue]);

  // フォールバック: アニメ完了イベントが来なくても必ず消す（cleanup は item 変化時のみ発火＝
  // fxQueue の並行イベントでは解除されない）
  useEffect(() => {
    if (!item) return;
    const id = item.id;
    const t = setTimeout(() => setItem((cur) => (cur && cur.id === id ? null : cur)), 2600);
    return () => clearTimeout(t);
  }, [item]);

  if (!item) return null;
  return (
    <motion.div
      key={item.id}
      className="sum-cut"
      initial={{ opacity: 0 }}
      // 出現(0→1) → 保持 → 消滅(→0) を1本のキーフレームで再生
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.55, times: [0, 0.08, 0.84, 1], ease: 'linear' }}
      onAnimationComplete={() => setItem((cur) => (cur && cur.id === item.id ? null : cur))}
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
  );
}

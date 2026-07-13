// 公開カードの大写し（fxQueue の type:'reveal'）。
// 用途: ①サーチで「公開して手札に加えた」カード ②イベント/カウンターの発動カード。
// どちらも盤面に残らないため、何が起きたのか分からないという問題への対処。
//
// 設計:
//  - 非ブロッキング・操作は透過（pointer-events:none）。ゲーム進行を待たせない。
//  - 表示と消滅を1本のキーフレームにまとめ、onAnimationComplete で state を落とす
//    （SummonCutIn と同じ方針＝タイマーが他イベントに割り込まれて出っぱなしになる事故を構造的に防ぐ）。
//  - 複数枚が連続で公開されるケース（サーチ2枚等）は、キューを順に1枚ずつ見せる。
//  - 自席/相手席で色味を変える（誰が使ったのかを一目で分かるように）。
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { useNetStore } from '../../state/netStore';
import { IMG, IMG_RAW } from '../../engine/img';
import type { Side } from '../../engine/types';

type Item = { id: number; side: Side; no: string; name: string; label: string };

export function CardReveal() {
  const fxQueue = useEngineStore((s) => s.fxQueue);
  const removeFx = useEngineStore((s) => s.removeFx);
  const mySeat = useNetStore((s) => s.mySeat);
  const seen = useRef<Set<number>>(new Set());
  const queue = useRef<Item[]>([]);
  const [item, setItem] = useState<Item | null>(null);
  const [fallback, setFallback] = useState(false);

  // キューから reveal を取り込む（表示中なら順番待ちにする）
  useEffect(() => {
    let added = false;
    for (const f of fxQueue) {
      if (f.type !== 'reveal' || seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      removeFx(f.id);
      queue.current.push({ id: f.id, side: f.side, no: f.no, name: f.name, label: f.label });
      added = true;
    }
    if (added && !item) setItem(queue.current.shift() || null);
  }, [fxQueue, removeFx, item]);

  // 表示が終わったら次の1枚へ
  const next = () => { setFallback(false); setItem(queue.current.shift() || null); };

  // 万一アニメ完了イベントが来ない環境向けのフォールバック（item ごと）
  useEffect(() => {
    if (!item) return;
    const t = setTimeout(() => setFallback(true), 1800);
    return () => clearTimeout(t);
  }, [item]);
  useEffect(() => { if (fallback) next(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fallback]);

  if (!item) return null;
  const mine = item.side === mySeat;
  const onErr = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.dataset.fb) { img.style.visibility = 'hidden'; return; }
    img.dataset.fb = '1'; img.src = IMG_RAW(item.no);
  };

  return (
    <div className="reveal-host">
      <motion.div
        key={item.id}
        className={'reveal-card' + (mine ? ' mine' : ' opp')}
        initial={{ opacity: 0, scale: 0.7, y: 14 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.7, 1, 1, 0.94], y: [14, 0, 0, -8] }}
        transition={{ duration: 1.5, times: [0, 0.18, 0.78, 1], ease: 'easeOut' }}
        onAnimationComplete={next}
      >
        <span className="rv-label">{mine ? 'あなた' : '相手'}・{item.label}</span>
        <img src={IMG(item.no)} referrerPolicy="no-referrer" decoding="async" alt={item.name} onError={onErr} />
        <span className="rv-name">{item.name}</span>
      </motion.div>
    </div>
  );
}

// 公開カードの大写し（fxQueue の type:'reveal'）。
// 用途:
//   kind:'hand'  … サーチで「公開して手札に加えた」カード → 控えめ・短い（情報提示が主目的）
//   kind:'event' … イベント/カウンターの発動カード       → ★大型カットイン（トリガー演出と同格の見せ場）
// どちらも盤面に残らないカードなので「何が起きたのか分からない」への対処。
//
// 設計:
//  - 非ブロッキング・操作は透過（pointer-events:none）。ゲーム進行を待たせない。
//  - 表示と消滅を1本のキーフレームにまとめ、onAnimationComplete で state を落とす
//    （SummonCutIn と同じ方針＝タイマーが他イベントに割り込まれて出っぱなしになる事故を構造的に防ぐ）。
//  - 連続公開（サーチ2枚・カウンター連打など）はキューに積み、1枚ずつ順に見せる。
//  - 自席/相手席で色味を変える（誰が使ったのかを一目で分かるように）。
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { useNetStore } from '../../state/netStore';
import { IMG, IMG_BIG, IMG_RAW } from '../../engine/img';
import type { Side } from '../../engine/types';

type Item = { id: number; side: Side; no: string; name: string; label: string; kind: 'hand' | 'event' };

const imgErr = (raw: string) => (e: React.SyntheticEvent<HTMLImageElement>) => {
  const el = e.currentTarget;
  if (el.dataset.fb) { el.style.visibility = 'hidden'; return; }
  el.dataset.fb = '1'; el.src = raw;
};

// 画面シェイク（既存 .felt.quake を再利用・自動除去）。カード着弾の瞬間に叩く。
const quake = () => {
  const felt = document.querySelector('.felt');
  if (!felt) return;
  felt.classList.remove('quake');
  void (felt as HTMLElement).offsetWidth;
  felt.classList.add('quake');
  setTimeout(() => document.querySelector('.felt')?.classList.remove('quake'), 480);
};

export function CardReveal() {
  const fxQueue = useEngineStore((s) => s.fxQueue);
  const removeFx = useEngineStore((s) => s.removeFx);
  const mySeat = useNetStore((s) => s.mySeat);
  const seen = useRef<Set<number>>(new Set());
  const queue = useRef<Item[]>([]);
  const [item, setItem] = useState<Item | null>(null);

  // キューから reveal を取り込む（表示中なら順番待ちにする）
  useEffect(() => {
    let added = false;
    for (const f of fxQueue) {
      if (f.type !== 'reveal' || seen.current.has(f.id)) continue;
      seen.current.add(f.id);
      removeFx(f.id);
      queue.current.push({ id: f.id, side: f.side, no: f.no, name: f.name, label: f.label, kind: f.kind || 'hand' });
      added = true;
    }
    if (added && !item) setItem(queue.current.shift() || null);
  }, [fxQueue, removeFx, item]);

  const next = (id: number) => setItem((cur) => (cur && cur.id === id ? (queue.current.shift() || null) : cur));

  // イベントカットインは着弾でシェイク
  useEffect(() => {
    if (!item || item.kind !== 'event') return;
    const t = setTimeout(quake, 160);
    return () => clearTimeout(t);
  }, [item]);

  // フォールバック: アニメ完了イベントが来ない環境でも必ず消す
  useEffect(() => {
    if (!item) return;
    const id = item.id;
    const t = setTimeout(() => next(id), item.kind === 'event' ? 2600 : 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) return null;
  const mine = item.side === mySeat;

  /* ---- イベント/カウンター発動: 大型カットイン（激しめ） ----
     開幕フラッシュ → 回転する放射光の中へカードを叩きつける（着弾でシェイク）
     → 衝撃波リング＋粒子バースト → ラベル＋カード名バナー → フェードアウト。 */
  if (item.kind === 'event') {
    return (
      <motion.div
        key={item.id}
        className={'ev-cut' + (mine ? ' mine' : ' opp')}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.9, times: [0, 0.06, 0.82, 1], ease: 'linear' }}
        onAnimationComplete={() => next(item.id)}
      >
        <div className="ev-scrim" />
        <div className="ev-flash" />
        <div className="ev-stage">
          <div className="ev-rays" />
          <motion.div
            className="ev-chip"
            initial={{ y: -18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 460, damping: 20 }}
          >
            {mine ? 'あなた' : '相手'}・{item.label}
          </motion.div>
          <motion.img
            src={IMG_BIG(item.no)}
            referrerPolicy="no-referrer"
            decoding="async"
            alt={item.name}
            initial={{ scale: 2.1, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 620, damping: 16, mass: 0.9 }}
            onError={imgErr(IMG_RAW(item.no))}
          />
          <div className="ev-ring" />
          <div className="ev-parts" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ ['--a' as any]: (i * 30 + 6) + 'deg', ['--d' as any]: (110 + (i % 3) * 40) + 'px' }} />
            ))}
          </div>
          <motion.div
            className="ev-name"
            initial={{ y: 22, opacity: 0, scale: 1.25 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: 0.14, type: 'spring', stiffness: 480, damping: 20 }}
          >
            {item.name}
          </motion.div>
        </div>
      </motion.div>
    );
  }

  /* ---- サーチで手札に加えた: 控えめ・短い ---- */
  return (
    <div className="reveal-host">
      <motion.div
        key={item.id}
        className={'reveal-card' + (mine ? ' mine' : ' opp')}
        initial={{ opacity: 0, scale: 0.7, y: 14 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.7, 1, 1, 0.94], y: [14, 0, 0, -8] }}
        transition={{ duration: 1.5, times: [0, 0.18, 0.78, 1], ease: 'easeOut' }}
        onAnimationComplete={() => next(item.id)}
      >
        <span className="rv-label">{mine ? 'あなた' : '相手'}・{item.label}</span>
        <img src={IMG(item.no)} referrerPolicy="no-referrer" decoding="async" alt={item.name} onError={imgErr(IMG_RAW(item.no))} />
        <span className="rv-name">{item.name}</span>
      </motion.div>
    </div>
  );
}

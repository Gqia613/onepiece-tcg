// 演出オーバーレイ。元 src/40-ui-render.js の floatOn / showFxNote(fxNote) を React+Framer で置換。
// store.fxQueue を購読し type==='float' と type==='fxnote' を消化する。
// 各イベントは「一度だけ」描画→アニメ完了で removeFx（seen を useRef で重複防止）。
// body 直付け(position:fixed)。元と違いカード座標は getBoundingClientRect()=ビューポート基準なので fixed が正しい。
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG, IMG_RAW } from '../../engine/img';
import type { FxEvent } from '../../engine/types';

// 元 CSS の .float.* / .fx-note.* と同じ色（battle.css の :root 変数）。
const FLOAT_COLOR: Record<string, string> = {
  buff: '#f5d98a', // --gold-soft
  dmg: '#ff6a4d', // --danger-glow
  heal: '#48c98a', // --good
};

type FloatItem = { id: number; uid: number; text: string; kind?: string; x: number; y: number };
type NoteItem = { id: number; side: 'me' | 'cpu'; label: string; name: string; no?: string };

export function FxLayer() {
  const fxQueue = useEngineStore((s) => s.fxQueue);
  const removeFx = useEngineStore((s) => s.removeFx);

  const seen = useRef<Set<number>>(new Set());
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);

  // 新着 float / fxnote を一度だけ取り込む。座標解決は取り込み時に行う（消化済みは store から消えても表示は継続）。
  useEffect(() => {
    for (const f of fxQueue) {
      if (seen.current.has(f.id)) continue;
      if (f.type === 'float') {
        seen.current.add(f.id);
        const { x, y } = locate(f.uid);
        setFloats((cur) => [...cur, { id: f.id, uid: f.uid, text: f.text, kind: f.kind, x, y }]);
        removeFx(f.id);
      } else if (f.type === 'fxnote') {
        seen.current.add(f.id);
        setNotes((cur) => [...cur, { id: f.id, side: f.side, label: f.label, name: f.name, no: f.no }]);
        removeFx(f.id);
      }
    }
    // seen が肥大しないよう、store から消えた id は忘れる（再利用 id が来ても安全）。
    if (seen.current.size > 256) {
      const live = new Set(fxQueue.map((e: FxEvent) => e.id));
      for (const id of seen.current) if (!live.has(id)) seen.current.delete(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxQueue]);

  return (
    <>
      {/* フローティング数値（カード上に湧き上がる）。fixed=ビューポート基準。 */}
      <AnimatePresence>
        {floats.map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 6, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: -46 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut', times: [0, 0.25, 0.7, 1] }}
            onAnimationComplete={() => setFloats((cur) => cur.filter((x) => x.id !== f.id))}
            style={{
              position: 'fixed',
              left: f.x,
              top: f.y,
              transform: 'translateX(-50%)',
              zIndex: 9100,
              pointerEvents: 'none',
              fontFamily: '"Bebas Neue"',
              fontSize: 26,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              textShadow: '0 2px 6px #000',
              color: FLOAT_COLOR[f.kind || ''] || '#f5d98a',
            }}
          >
            {f.text}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 効果・トリガー発生通知のピル（画面上部中央に積む）。元 .fx-note を 1:1 再現。
          top:56 ＝ Thinking ピル(top:16)やトップバーと重ならない段に置く。 */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: 56,
          transform: 'translateX(-50%)',
          zIndex: 9200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {notes.map((n) => (
            <motion.div
              key={n.id}
              layout
              className={'fx-note ' + (n.side === 'me' ? 'mine' : 'opp')}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ position: 'static', transform: 'none' }}
            >
              {n.side === 'me' ? null : <span className="fx-side">CPU</span>}
              {n.no ? (
                <img
                  className="fx-note-img"
                  src={IMG(n.no)}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  alt=""
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (el.dataset.fb) { el.style.display = 'none'; return; }
                    el.dataset.fb = '1';
                    el.src = IMG_RAW(n.no as string);
                  }}
                />
              ) : null}
              <span className="fx-note-lbl">{n.label}</span>
              {n.name ? <span className="fx-note-nm">{n.name}</span> : null}
              <NoteTimer id={n.id} side={n.side} onDone={() => setNotes((cur) => cur.filter((x) => x.id !== n.id))} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

// 元 showFxNote は 1.4s 後に自動消滅。タイマーで exit を発火させる（AnimatePresence が退場アニメを担当）。
// 相手(CPU)の効果通知は読む前に消えやすいため長めに表示（自分=1.6s / 相手=2.4s。エンジンの進行は待たせない）。
function NoteTimer({ id, side, onDone }: { id: number; side: 'me' | 'cpu'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, side === 'me' ? 1600 : 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}

// data-uid からカードの画面座標（上端中央付近）を得る。見つからなければ画面中央寄りで出す。
function locate(uid: number): { x: number; y: number } {
  const el = typeof document !== 'undefined' ? document.querySelector('[data-uid="' + uid + '"]') : null;
  if (el) {
    const r = (el as HTMLElement).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 6 };
  }
  // フォールバック: 画面中央やや上。
  const w = typeof window !== 'undefined' ? window.innerWidth : 800;
  const h = typeof window !== 'undefined' ? window.innerHeight : 600;
  return { x: w / 2, y: h * 0.44 };
}

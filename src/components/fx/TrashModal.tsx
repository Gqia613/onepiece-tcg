// トラッシュ閲覧モーダル（クリック/タッチ＝H5）。元 showTrashModal 相当。
// store.trashModal(Side|null) を購読し、その側のトラッシュを新しい順にグリッド表示。.modal-back/.modal/.trash-modal-grid/.tm-card を再利用。
// 各カードは長押し（タッチ）／クリック（PC）でカード大写し（setZoomCard）を開ける。
import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG } from '../../engine/img';
import type { Card } from '../../engine/types';

// トラッシュ内の1枚。長押し(450ms)＝効果表示、PCはクリックで即表示。Card.tsx の長押しロジックを踏襲。
function TmCard({ card }: { card: Card }) {
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const lpFired = useRef(false);
  const b = card.base;
  const openDetail = () => useEngineStore.getState().setZoomCard({ no: card.no, name: card.base.name });

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]; if (!t) return;
    lpFired.current = false; lpStart.current = { x: t.clientX, y: t.clientY };
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      lpFired.current = true;
      openDetail();
      if ((navigator as any).vibrate) { try { (navigator as any).vibrate(12); } catch { /* ignore */ } }
    }, 450);
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0]; if (!t || !lpStart.current) return;
    if (Math.abs(t.clientX - lpStart.current.x) > 10 || Math.abs(t.clientY - lpStart.current.y) > 10) {
      if (lpTimer.current) clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  }
  function onTouchEnd() { if (lpTimer.current) clearTimeout(lpTimer.current); lpTimer.current = null; }
  // PC は通常クリックで詳細。タッチで長押し発火済みのときはクリックを無視。
  function onClick() { if (lpFired.current) { lpFired.current = false; return; } openDetail(); }

  return (
    <div
      className="tm-card"
      title={b.name}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <img src={IMG(b.no)} referrerPolicy="no-referrer" decoding="async" alt={b.name}
        onError={(e) => { const t = e.currentTarget as HTMLImageElement; t.style.display = 'none'; t.parentElement?.classList.add('noimg'); }} />
      <span className="tm-fb">{b.name}</span>
    </div>
  );
}

export function TrashModal() {
  const engine = useEngineStore((s) => s.engine);
  const side = useEngineStore((s) => s.trashModal);
  useEngineStore((s) => s.version);
  const close = () => useEngineStore.getState().setTrashModal(null);

  const open = !!(engine && side);
  const trash: Card[] = open ? ((engine!.G.players?.[side!]?.trash || []) as Card[]) : [];
  const cards = trash.slice().reverse(); // 新しい順
  const title = side ? `${side === 'me' ? 'あなた' : 'CPU'}のトラッシュ（${trash.length}枚）` : '';

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="modal-back show"
          style={{ position: 'fixed', display: 'flex' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          onClick={close}
        >
          <motion.div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
          >
            <button className="close" onClick={close}>×</button>
            <h2 className="trash-title">{title}</h2>
            {cards.length === 0 ? (
              <div style={{ color: 'var(--muted)', padding: '8px 2px' }}>トラッシュは空です</div>
            ) : (
              <div className="trash-modal-grid">
                {cards.map((c, i) => (
                  <TmCard card={c} key={(c.uid ?? i) + ':' + i} />
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

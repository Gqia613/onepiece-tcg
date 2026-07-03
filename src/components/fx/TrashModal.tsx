// トラッシュ閲覧モーダル（クリック/タッチ＝H5）。元 showTrashModal 相当。
// store.trashModal(Side|null) を購読し、その側のトラッシュを新しい順にグリッド表示。.modal-back/.modal/.trash-modal-grid/.tm-card を再利用。
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG } from '../../engine/img';
import type { Card } from '../../engine/types';

export function TrashModal() {
  const engine = useEngineStore((s) => s.engine);
  const side = useEngineStore((s) => s.trashModal);
  useEngineStore((s) => s.version);
  const close = () => useEngineStore.getState().setTrashModal(null);

  const open = !!(engine && side);
  const trash: Card[] = open ? ((engine!.G.players?.[side!]?.trash || []) as Card[]) : [];
  const cards = trash.slice().reverse(); // 新しい順
  const title = side ? `${side === 'me' ? 'あなた' : 'CPU'}のトラッシュ（${trash.length}枚・新しい順）` : '';

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
            <h2>{title}</h2>
            {cards.length === 0 ? (
              <div style={{ color: 'var(--muted)', padding: '8px 2px' }}>トラッシュは空です</div>
            ) : (
              <div className="trash-modal-grid">
                {cards.map((c, i) => (
                  <div className="tm-card" key={(c.uid ?? i) + ':' + i} title={c.base.name}>
                    <img src={IMG(c.base.no)} referrerPolicy="no-referrer" decoding="async" alt={c.base.name}
                      onError={(e) => { const t = e.currentTarget as HTMLImageElement; t.style.display = 'none'; t.parentElement?.classList.add('noimg'); }} />
                    <span className="tm-fb">{c.base.name}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

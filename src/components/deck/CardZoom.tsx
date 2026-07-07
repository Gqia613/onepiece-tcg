// カードのタップ拡大オーバーレイ（全画面・中央にカード大写し）。どこをタップしても元に戻る。
// DeckListModal（デッキ選択のカードリスト）と DeckBuilder（デッキ作成）で共用。呼び出し側で AnimatePresence に包む。
// 画像は IMG_BIG → IMG の2段フォールバック、両方失敗時はカード名を表示。
import { useState } from 'react';
import { motion } from 'framer-motion';
import { IMG, IMG_BIG } from '../../engine/img';

export function ZoomView({ no, name, onClose }: { no: string; name: string; onClose: () => void }) {
  const [stage, setStage] = useState(0);
  const src = stage === 0 ? IMG_BIG(no) : stage === 1 ? IMG(no) : '';
  return (
    <motion.div
      className="card-zoom-back"
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        background: 'rgba(2,5,10,.86)', cursor: 'zoom-out',
      }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      {src ? (
        <motion.img
          src={src} referrerPolicy="no-referrer" decoding="async" alt={name}
          style={{ maxWidth: 'min(88vw, 460px)', maxHeight: '88vh', borderRadius: 12, boxShadow: '0 24px 70px #000', display: 'block' }}
          initial={{ scale: 0.85 }} animate={{ scale: 1 }} exit={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onError={() => setStage((s) => s + 1)}
        />
      ) : (
        <div style={{ color: '#fff', fontWeight: 800 }}>{name}</div>
      )}
    </motion.div>
  );
}

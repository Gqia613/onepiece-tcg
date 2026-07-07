// カードのタップ拡大オーバーレイ（全画面・中央にカード大写し）。どこをタップしても元に戻る。
// DeckListModal（デッキ選択のカードリスト）と DeckBuilder（デッキ作成）で共用。呼び出し側で AnimatePresence に包む。
//
// 体感速度対策: まずグリッドで表示済み＝キャッシュ済みの低解像度(IMG=w320)を「即」表示し、
// 高解像度(IMG_BIG=w640)は裏で先読み(new Image)→完了後に差し替え（キャッシュ済みなので瞬時・チラつき無し）。
// 高解像度の読み込み中はスピナー（ローディング）を表示。表示画像すら出せない時はカード名を出す。
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { IMG, IMG_BIG } from '../../engine/img';

export function ZoomView({ no, name, onClose }: { no: string; name: string; onClose: () => void }) {
  const [src, setSrc] = useState<string>(IMG(no)); // 初期はキャッシュ済みサムネ＝即表示
  const [hiReady, setHiReady] = useState(false);   // 高解像度の読み込み完了/断念
  const [failed, setFailed] = useState(false);     // 表示画像すら出せない

  // 高解像度を裏で先読みし、成功したら src を差し替え（既にデコード済みなので差し替えは瞬時）。
  useEffect(() => {
    setSrc(IMG(no)); setHiReady(false); setFailed(false);
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => { setSrc(IMG_BIG(no)); setHiReady(true); };
    img.onerror = () => setHiReady(true); // 高解像度は諦めてサムネ維持
    img.src = IMG_BIG(no);
    return () => { img.onload = null; img.onerror = null; };
  }, [no]);

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
      {!failed ? (
        <motion.img
          src={src} referrerPolicy="no-referrer" decoding="async" alt={name}
          style={{ maxWidth: 'min(88vw, 460px)', maxHeight: '88vh', borderRadius: 12, boxShadow: '0 24px 70px #000', display: 'block' }}
          initial={{ scale: 0.85 }} animate={{ scale: 1 }} exit={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div style={{ color: '#fff', fontWeight: 800 }}>{name}</div>
      )}

      {/* 高解像度の読み込み中スピナー（サムネは既に表示されている） */}
      {!hiReady && !failed ? (
        <div
          style={{
            position: 'absolute', bottom: '7%', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999,
            background: 'rgba(0,0,0,.62)', color: '#fff', fontSize: 12.5, pointerEvents: 'none',
          }}
        >
          <motion.span
            animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
            style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', display: 'inline-block' }}
          />
          高画質を読み込み中…
        </div>
      ) : null}
    </motion.div>
  );
}

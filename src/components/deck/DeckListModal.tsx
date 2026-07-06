// デッキのカードリストを画像付きで表示するモーダル（デッキ選択画面の「📋 カードリスト」から開く）。
// .modal-back/.modal/.close/.trash-modal-grid/.tm-card/.tm-fb（battle.css）を再利用。engine.C からカードメタを引く。
// 画像は in-battle Card と同じ2段フォールバック（IMG=weserv → IMG_RAW=直リンク → 名前表示）。パラレル(_rN)は no そのままで解決。
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IMG, IMG_RAW, IMG_BIG } from '../../engine/img';
import type { Deck } from '../../engine/types';

const TYPE_ORDER: Record<string, number> = { LEADER: 0, CHAR: 1, EVENT: 2, STAGE: 3 };
const COLOR_HEX: Record<string, string> = {
  赤: 'var(--c-red)', 緑: 'var(--c-green)', 青: 'var(--c-blue)',
  紫: 'var(--c-purple)', 黒: 'var(--c-black)', 黄: 'var(--c-yellow)',
};

// カード1枚のサムネイル（画像フォールバック＋採用枚数バッジ）。タップで onZoom（拡大トグル）。
function Thumb({ no, name, count, cost, onZoom }: { no: string; name: string; count: number; cost?: number; onZoom?: () => void }) {
  const [stage, setStage] = useState(0);
  const src = stage === 0 ? IMG(no) : stage === 1 ? IMG_RAW(no) : '';
  return (
    <div
      className={'dl-thumb' + (src ? '' : ' noimg')}
      title={`${name}${cost != null ? `（コスト${cost}）` : ''} ×${count}`}
      onClick={onZoom ? (e) => { e.stopPropagation(); onZoom(); } : undefined}
    >
      {src ? (
        <img
          src={src} referrerPolicy="no-referrer" decoding="async" alt={name}
          onError={() => setStage((s) => s + 1)}
        />
      ) : null}
      <span className="dl-fb">{name}</span>
      {count > 1 ? (
        <span
          style={{
            position: 'absolute', right: 3, bottom: 3, zIndex: 3,
            fontFamily: 'var(--font-num)', fontWeight: 800, fontSize: 12, lineHeight: '16px',
            minWidth: 20, textAlign: 'center', padding: '0 4px', borderRadius: 999,
            background: 'linear-gradient(180deg,var(--gold-soft),var(--gold))', color: '#1a1205',
            boxShadow: '0 1px 4px #000a', border: '1px solid #0006',
          }}
        >×{count}</span>
      ) : null}
    </div>
  );
}

// タップ拡大のオーバーレイ（全画面・中央にカード大写し）。どこをタップしても元に戻る。
function ZoomView({ no, name, onClose }: { no: string; name: string; onClose: () => void }) {
  const [stage, setStage] = useState(0);
  const src = stage === 0 ? IMG_BIG(no) : stage === 1 ? IMG(no) : '';
  return (
    <motion.div
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

export function DeckListModal({ deck, C, onClose }: {
  deck: Deck | null;
  C: Record<string, any>;
  onClose: () => void;
}) {
  const open = !!deck;
  const [zoom, setZoom] = useState<{ no: string; name: string } | null>(null); // タップ拡大中のカード
  // 別デッキを開いた/閉じたら拡大状態をリセット（前回の拡大が残らないように）。
  useEffect(() => { setZoom(null); }, [deck?.id, open]);
  const list = (deck?.list || {}) as Record<string, number>;

  // list（{no:枚数}）を engine.C のメタで解決し、種別→コスト→パワーで並べる。
  const entries = Object.entries(list)
    .map(([no, count]) => {
      const b = C[no] || C[no.replace(/_r\d+$/, '')] || { no, name: no, type: 'CHAR', cost: 0, power: 0 };
      return { no, count, b };
    })
    .sort((a, b) =>
      (TYPE_ORDER[a.b.type] ?? 9) - (TYPE_ORDER[b.b.type] ?? 9) ||
      (a.b.cost || 0) - (b.b.cost || 0) ||
      (b.b.power || 0) - (a.b.power || 0)
    );

  const total = entries.reduce((s, e) => s + e.count, 0);
  const nOf = (t: string) => entries.filter((e) => e.b.type === t).reduce((s, e) => s + e.count, 0);
  const charN = nOf('CHAR'), eventN = nOf('EVENT'), stageN = nOf('STAGE');
  const colors = deck?.colors || deck?.color || [];
  const leader = deck ? (C[deck.leader] || { no: deck.leader, name: deck.leader }) : null;

  const section = (type: 'CHAR' | 'EVENT' | 'STAGE', label: string) => {
    const es = entries.filter((e) => e.b.type === type);
    if (!es.length) return null;
    const kinds = es.length, count = es.reduce((s, e) => s + e.count, 0);
    return (
      <div key={type} style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold-soft)', margin: '0 0 6px', letterSpacing: '.04em' }}>
          {label}　<span style={{ color: 'var(--muted)', fontWeight: 600 }}>{count}枚 / {kinds}種</span>
        </div>
        <div className="dl-grid">
          {es.map((e) => (
            <Thumb
              key={e.no} no={e.no} name={e.b.name} count={e.count} cost={e.b.cost}
              onZoom={() => setZoom({ no: e.no, name: e.b.name })}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="modal-back show"
          style={{ position: 'fixed', display: 'flex', zIndex: 120 }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
          >
            <button className="close" onClick={onClose}>×</button>
            <h2 style={{ marginBottom: 4 }}>{deck?.name}</h2>

            {/* リーダー行＋内訳 */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4 }}>
              {leader ? (
                <div style={{ width: 62, flex: '0 0 auto' }}>
                  <Thumb no={leader.no} name={leader.name} count={1} onZoom={() => setZoom({ no: leader.no, name: leader.name })} />
                </div>
              ) : null}
              <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800 }}>リーダー：{leader?.name}</span>
                  {colors.map((c, i) => (
                    <span key={i} className="dot" style={{ background: COLOR_HEX[c] || '#1a2c3c' }} />
                  ))}
                  {deck?.tier ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{deck.tier}</span> : null}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  合計 <b style={{ color: 'var(--ink)' }}>{total}</b>枚　（キャラ{charN} / イベント{eventN}{stageN ? ` / ステージ${stageN}` : ''}）
                </div>
              </div>
            </div>

            {section('CHAR', 'キャラクター')}
            {section('EVENT', 'イベント')}
            {section('STAGE', 'ステージ')}
          </motion.div>

          {/* タップ拡大オーバーレイ（.modal の上・全面）。再タップで戻る（登場アニメのみ・退場は即時）。 */}
          {zoom ? <ZoomView key={zoom.no} no={zoom.no} name={zoom.name} onClose={() => setZoom(null)} /> : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

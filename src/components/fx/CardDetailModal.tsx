// カード詳細モーダル（タッチの長押しで開く＝H6）。元 showCardModal/cardDetailHTML 相当。
// store.cardModal(Card|null) を購読。背景タップ/閉じるで消える。.modal-back.cardmodal/.cardmodal-box/.cardmodal-close を再利用。
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG } from '../../engine/img';

const TYPE_JA: Record<string, string> = { CHAR: 'キャラ', EVENT: 'イベント', STAGE: 'ステージ', LEADER: 'リーダー' };
const COLOR_HEX: Record<string, string> = { 赤: '#d2473f', 緑: '#2f9e63', 青: '#3a7fc9', 紫: '#9a57d4', 黒: '#5a6170', 黄: '#c9b03a' };

export function CardDetailModal() {
  const card = useEngineStore((s) => s.cardModal);
  const close = () => useEngineStore.getState().setCardModal(null);
  const b = card?.base;
  const showPow = b && (b.type === 'CHAR' || b.type === 'LEADER');
  const colorHex = (b && COLOR_HEX[(b.color && b.color[0]) as string]) || '#1a2c3c';

  return (
    <AnimatePresence>
      {b ? (
        <motion.div
          className="modal-back cardmodal show"
          style={{ position: 'fixed', display: 'flex' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          onClick={close}
        >
          <motion.div
            className="cardmodal-box"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.92, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
          >
            <div style={{ borderTop: `4px solid ${colorHex}`, padding: '12px 14px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <img src={IMG(b.no)} referrerPolicy="no-referrer" decoding="async" alt={b.name}
                  style={{ width: 70, borderRadius: 6, flex: '0 0 auto' }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <div>
                  <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--ink)', lineHeight: 1.25 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    {TYPE_JA[b.type] || b.type}
                    {b.cost != null ? ` ・ コスト${b.cost}` : ''}
                    {b.color && b.color.length ? ` ・ ${b.color.join('')}` : ''}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue'", fontSize: 16, color: '#fff', marginTop: 2 }}>
                    {showPow && b.power != null ? <>パワー <span style={{ color: 'var(--gold-soft)' }}>{b.power}</span>　</> : null}
                    {b.counter ? <>カウンター <span style={{ color: '#ffd27a' }}>{b.counter}</span></> : null}
                  </div>
                </div>
              </div>
              {b.traits && b.traits.length ? (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{b.traits.join(' / ')}</div>
              ) : null}
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink)', borderTop: '1px solid var(--line)', paddingTop: 8, whiteSpace: 'pre-wrap' }}>
                {b.text || '（効果なし）'}
              </div>
              {b.triggerText ? (
                <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.6, color: '#1a1205', background: 'linear-gradient(180deg,var(--gold-soft),var(--gold-dim))', borderRadius: 6, padding: '6px 8px', whiteSpace: 'pre-wrap' }}>
                  {b.triggerText}
                </div>
              ) : null}
            </div>
            <button className="cardmodal-close" onClick={close}>閉じる</button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

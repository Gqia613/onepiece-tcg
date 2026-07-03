// デッキ選択の1枚（元 src/60-screens-init.js:14-28 deckCard の JSX 化）。
// .deck-card / .tierbadge / .art / .scrim / .art-nm / .deck-pop ... の class名・DOM階層を 1:1 で再現。
// CSS(.deck-card 系)は battle.css にあるので class を変えない/省略しない。hover拡大だけ motion で軽く付与。
import { motion } from 'framer-motion';
import { IMG } from '../../engine/img';
import type { Deck } from '../../engine/types';

// 元 src/00-data.js:17 の COLOR_HEX（CSS変数で .dot の背景に流し込む）。
const COLOR_HEX: Record<string, string> = {
  赤: 'var(--c-red)', 緑: 'var(--c-green)', 青: 'var(--c-blue)',
  紫: 'var(--c-purple)', 黒: 'var(--c-black)', 黄: 'var(--c-yellow)',
};

export function DeckCard({ deck, selected, onSelect, onDelete }: {
  deck: Deck;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void; // クラウド保存デッキのみ削除可
}) {
  // DECKS の色フィールドは colors（custom デッキも colors）。念のため color もフォールバック。
  const colors = deck.colors || deck.color || [];
  const accuracy = (deck as any).accuracy === 'high' ? '高' : '中';

  return (
    <motion.div
      className={'deck-card' + (selected ? ' sel' : '')}
      style={{ position: 'relative' }}
      onClick={onSelect}
      whileHover={{ scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      {deck.tier ? <div className="tierbadge">{deck.tier}</div> : null}
      {onDelete ? (
        <button
          title="このデッキを削除"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            position: 'absolute', top: 4, right: 4, zIndex: 5, width: 22, height: 22, lineHeight: '20px',
            borderRadius: '50%', border: '1px solid var(--line)', background: '#000a', color: 'var(--danger)',
            fontSize: 13, cursor: 'pointer', padding: 0,
          }}
        >×</button>
      ) : null}

      <div className="art" style={{ backgroundImage: `url('${IMG(deck.leader)}')` }}>
        <div className="scrim" />
        <div className="art-nm">{deck.name}</div>
      </div>

      <div className="deck-pop">
        <div className="pop-nm">{deck.name}</div>
        <div className="colors">
          {colors.map((c, i) => (
            <span key={i} className="dot" style={{ background: COLOR_HEX[c] || '#1a2c3c' }} />
          ))}
          {deck.usage ? (
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 5 }}>
              使用率 {deck.usage}
            </span>
          ) : null}
        </div>
        {deck.desc ? <div className="pop-desc">{deck.desc}</div> : null}
        {deck.style ? (
          <span className="style-tag">{deck.style} ・ 再現度:{accuracy}</span>
        ) : null}
      </div>
    </motion.div>
  );
}

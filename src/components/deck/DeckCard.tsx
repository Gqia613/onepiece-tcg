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

// フリーアイコン（Feather Icons / MITライセンス）をインラインSVGで同梱（外部リクエストなし・currentColorでボタン色を継承）。
const ICON = { flex: '0 0 auto', display: 'block' } as const;
const ListIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={ICON} aria-hidden="true">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={ICON} aria-hidden="true">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);
const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={ICON} aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export function DeckCard({ deck, selected, onSelect, onDelete, onShowList, onEdit, editLabel, hideTier, noPop }: {
  deck: Deck;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void; // クラウド保存デッキのみ削除可
  onShowList?: () => void; // カードリストをモーダル表示
  onEdit?: () => void; // ビルダーで開く（クラウド=編集 / プリセット=コピー）
  editLabel?: string;
  hideTier?: boolean; // TIERバッジを隠す（対戦画面のデッキ選択で使用）
  noPop?: boolean; // ホバー/タップの解説オーバーレイ(deck-pop)を出さない（対戦画面のデッキ選択で使用）
}) {
  // DECKS の色フィールドは colors（custom デッキも colors）。念のため color もフォールバック。
  const colors = deck.colors || deck.color || [];
  const accuracy = (deck as any).accuracy === 'high' ? '高' : '中';
  const editText = editLabel || '編集';
  const isCopy = editText.includes('コピー'); // プリセット=コピーして編集 / クラウド=編集

  return (
    <motion.div
      className={'deck-card' + (selected ? ' sel' : '')}
      style={{ position: 'relative' }}
      onClick={onSelect}
      whileHover={{ scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      {deck.tier && !hideTier ? <div className="tierbadge">{deck.tier}</div> : null}
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

      {onShowList ? (
        <button
          className="dc-pill"
          title="カードリストを見る"
          aria-label="カードリストを見る"
          onClick={(e) => { e.stopPropagation(); onShowList(); }}
          style={{
            position: 'absolute', top: 6, right: onDelete ? 34 : 6, zIndex: 11,
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(0,0,0,.78)', border: '1px solid var(--surface-edge)',
            color: 'var(--ink)', padding: '3px 8px', borderRadius: 999,
          }}
        ><ListIcon /><span className="dc-btn-txt">カードリスト</span></button>
      ) : null}

      {onEdit ? (
        <button
          className="dc-pill"
          title={editText}
          aria-label={editText}
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          style={{
            position: 'absolute', top: 32, right: onDelete ? 34 : 6, zIndex: 11,
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(0,0,0,.78)', border: '1px solid var(--surface-edge)',
            color: 'var(--gold-soft)', padding: '3px 8px', borderRadius: 999,
          }}
        >{isCopy ? <CopyIcon /> : <EditIcon />}<span className="dc-btn-txt">{editText}</span></button>
      ) : null}

      <div className="art" style={{ backgroundImage: `url('${IMG(deck.leader)}')` }}>
        <div className="scrim" />
        <div className="art-nm">{deck.name}</div>
      </div>

      {!noPop ? (
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
      ) : null}
    </motion.div>
  );
}

// デッキ選択の1枚（元 src/60-screens-init.js:14-28 deckCard の JSX 化）。
// .deck-card / .tierbadge / .art / .scrim / .art-nm / .deck-pop ... の class名・DOM階層を 1:1 で再現。
// CSS(.deck-card 系)は battle.css にあるので class を変えない/省略しない。hover拡大だけ motion で軽く付与。
import { motion } from 'framer-motion';
import { IMG } from '../../engine/img';
import type { Deck } from '../../engine/types';

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

export function DeckCard({ deck, selected, onSelect, onDelete, onShowList, onEdit, editLabel, hideTier, highlight }: {
  deck: Deck;
  selected: boolean;
  highlight?: boolean; // 保存直後などの一回きりのお祝いパルス
  onSelect: () => void;
  onDelete?: () => void; // クラウド保存デッキのみ削除可
  onShowList?: () => void; // カードリストをモーダル表示
  onEdit?: () => void; // ビルダーで開く（クラウド=編集 / プリセット=コピー）
  editLabel?: string;
  hideTier?: boolean; // TIERバッジを隠す（対戦画面のデッキ選択で使用）
}) {
  const editText = editLabel || '編集';
  const isCopy = editText.includes('コピー'); // プリセット=コピーして編集 / クラウド=編集

  return (
    <motion.div
      className={'deck-card' + (selected ? ' sel' : '') + (highlight ? ' just-saved' : '')}
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
            position: 'absolute', top: 4, right: 4, zIndex: 5, width: 28, height: 28, lineHeight: '26px',
            borderRadius: '50%', border: '1px solid var(--line)', background: '#000a', color: 'var(--danger)',
            fontSize: 14, cursor: 'pointer', padding: 0,
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
            position: 'absolute', top: 6, right: onDelete ? 38 : 6, zIndex: 11,
            display: 'flex', alignItems: 'center', gap: 4, minHeight: 26,
            fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(0,0,0,.78)', border: '1px solid var(--surface-edge)',
            color: 'var(--ink)', padding: '4px 9px', borderRadius: 999,
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
            position: 'absolute', top: 38, right: onDelete ? 38 : 6, zIndex: 11,
            display: 'flex', alignItems: 'center', gap: 4, minHeight: 26,
            fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(0,0,0,.78)', border: '1px solid var(--surface-edge)',
            color: 'var(--gold-soft)', padding: '4px 9px', borderRadius: 999,
          }}
        >{isCopy ? <CopyIcon /> : <EditIcon />}<span className="dc-btn-txt">{editText}</span></button>
      ) : null}

      {/* 常にカード画像を表示（ホバー時の解説オーバーレイ deck-pop は廃止） */}
      <div className="art" style={{ backgroundImage: `url('${IMG(deck.leader)}')` }}>
        <div className="scrim" />
        <div className="art-nm">{deck.name}</div>
      </div>
    </motion.div>
  );
}

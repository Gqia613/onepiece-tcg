// 絵違い（パラレル _pN / 再録別イラスト _rN）の選択モーダル。デッキ作成（DeckBuilder）から開く。
// 絵違いは効果・数値が本体と同一＝エンジンは C[絵柄番号] を本体カードへのエイリアスとして扱い、画像だけ絵柄番号で出す。
// mode='deck'  : 絵柄ごとに −/＋ で枚数を振り分け（合計は本体番号で4枚まで＝エンジンの sameCardCount が判定）
// mode='leader': 1枚を選ぶ（タップで確定）
import { motion } from 'framer-motion';
import { IMG } from '../../engine/img';

export type ArtOpt = { no: string; label: string };

// 絵柄の表示ラベル: 本体=通常 / _pN=パラレルN / _rN=再録N（＋収録弾）
export function artOptions(baseNo: string, arts: Array<[string, string]>): ArtOpt[] {
  const out: ArtOpt[] = [{ no: baseNo, label: '通常' }];
  for (const [no, set] of arts) {
    const m = /_([pr])(\d+)$/.exec(no);
    const kind = m ? (m[1] === 'p' ? 'パラレル' : '別イラスト') + m[2] : no;
    out.push({ no, label: kind + (set ? '・' + set : '') });
  }
  return out;
}

export function ArtPicker({ name, options, mode, counts, selected, onAdd, onRemove, onPick, onZoom, onClose }: {
  name: string;
  options: ArtOpt[];
  mode: 'deck' | 'leader';
  counts?: Record<string, number>;
  selected?: string | null;
  onAdd?: (no: string) => void;
  onRemove?: (no: string) => void;
  onPick?: (no: string) => void;
  onZoom?: (no: string) => void;
  onClose: () => void;
}) {
  const total = mode === 'deck' ? options.reduce((a, o) => a + ((counts && counts[o.no]) || 0), 0) : 0;
  return (
    <motion.div className="art-pick-back" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
      <motion.div className="art-pick" role="dialog" aria-label={name + 'の絵柄を選択'} onClick={(e) => e.stopPropagation()}
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}>
        <div className="art-pick-head">
          <div className="art-pick-title">{name}<span>絵柄を選択{mode === 'deck' ? `（合計${total}枚）` : ''}</span></div>
          <button className="art-pick-x" aria-label="閉じる" onClick={onClose}>×</button>
        </div>
        <div className="art-pick-grid">
          {options.map((o) => {
            const n = (counts && counts[o.no]) || 0;
            const on = mode === 'leader' ? selected === o.no : n > 0;
            return (
              <div className={'art-pick-item' + (on ? ' on' : '')} key={o.no}>
                <div className="art-pick-img" onClick={() => (mode === 'leader' ? onPick?.(o.no) : onZoom?.(o.no))}>
                  <img src={IMG(o.no)} referrerPolicy="no-referrer" loading="lazy" decoding="async" alt={o.label}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                </div>
                <div className="art-pick-label">{o.label}</div>
                {mode === 'deck' ? (
                  <div className="bd-ctl">
                    <button className="bd-mn" onClick={() => onRemove?.(o.no)}>−</button>
                    <span className="bd-num">{n}</span>
                    <button className="bd-pl" onClick={() => onAdd?.(o.no)}>＋</button>
                  </div>
                ) : (
                  <button className={'bd-fbtn' + (on ? ' on' : '')} onClick={() => onPick?.(o.no)}>{on ? '使用中' : 'この絵柄にする'}</button>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

// デッキ選択の共有グリッド（CPU対戦=DeckSelect と オンライン=OnlineLobby で同一デザイン）。
// 横4列・枠内だけ縦スクロール。タップしたデッキ＝選択。カスタム↔プリセットはトグルで切替。
// CSSは battle.css の .ds-grid / .dsg-item / .ds-cat-toggle 系を共用（＝見た目・挙動が一致）。
import { useEffect, useRef, useState } from 'react';
import type { Deck } from '../../engine/types';
import { IMG } from '../../engine/img';
import { Icon } from '../ui/Icon';

const AURA_HEX: Record<string, string> = {
  赤: '#d2473f', 緑: '#2f9e63', 青: '#3a7fc9', 紫: '#9a57d4', 黒: '#7a8496', 黄: '#c9b03a',
};
function deckColors(d: Deck): string[] { return (d.colors || d.color || []) as string[]; }
function auraOf(d: Deck): string { return AURA_HEX[deckColors(d)[0]] || '#3ec9ff'; }

export function DeckGrid({ customList, presetList, selectedId, onSelect }: {
  customList: Deck[];
  presetList: Deck[];
  selectedId?: string;            // 現在の選択（外部制御）
  onSelect: (deck: Deck) => void; // タップされたデッキを通知
}) {
  const hasCustom = customList.length > 0;
  const catOf = (id?: string): 'custom' | 'preset' =>
    id && customList.some((d) => d.id === id) ? 'custom'
      : id && presetList.some((d) => d.id === id) ? 'preset'
        : hasCustom ? 'custom' : 'preset';
  const [cat, setCat] = useState<'custom' | 'preset'>(catOf(selectedId));
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ordered = cat === 'custom' ? customList : presetList;

  // 選択中デッキを見える位置へ寄せる（カテゴリ切替・外部からの選択変更時）
  const scrollSelIntoView = () => {
    const el = gridRef.current?.querySelector('.dsg-item.on') as HTMLElement | null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  };

  // 未選択なら先頭デッキを既定選択（「準備完了」を1タップで押せる状態から始める）
  useEffect(() => {
    if (selectedId) return;
    const d = ordered[0];
    if (d) onSelect(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ordered.length]);

  // 外部から selectedId が変わった時: 別カテゴリならタブを追随、同カテゴリなら見える位置へ
  useEffect(() => {
    if (!selectedId) return;
    const c = catOf(selectedId);
    if (c !== cat) { setCat(c); return; } // ↓のcat effectが位置合わせ
    scrollSelIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // カテゴリ切替: 一覧を見て回るだけなので選択は変えない（タップで初めて選択が動く）
  useEffect(() => {
    if (!ordered.length) return;
    scrollSelIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, ordered.length]);

  return (
    <>
      {hasCustom ? (
        <div className="ds-tabsrow" style={{ justifyContent: 'center' }}>
          <button
            className="ds-cat-toggle"
            onClick={() => setCat(cat === 'custom' ? 'preset' : 'custom')}
            title={cat === 'custom' ? 'プリセットに切り替え' : 'マイデッキに切り替え'}
          >
            <Icon.repeat size={13} />
            {cat === 'custom' ? `マイデッキ (${customList.length})` : `プリセット (${presetList.length})`}
          </button>
        </div>
      ) : null}
      <div className="ds-grid" ref={gridRef}>
        {ordered.map((d) => (
          <div
            key={d.id}
            className={'dsg-item' + (d.id === selectedId ? ' on' : '')}
            style={{ ['--aura' as any]: auraOf(d) }}
            onClick={() => onSelect(d)}
          >
            {d.tier ? <div className="dsc-tier">{d.tier}</div> : null}
            <div className="art" style={{ backgroundImage: `url('${IMG(d.leader)}')` }}>
              <div className="scrim" />
              <div className="art-nm">{d.name}</div>
            </div>
          </div>
        ))}
        {!ordered.length ? <div className="ds-grid-empty">このカテゴリにデッキがありません</div> : null}
      </div>
    </>
  );
}

// デッキ選択の共有カルーセル（CPU対戦=DeckSelect と オンライン=OnlineLobby で同一デザイン）。
// 中央のデッキ＝選択。横スワイプ/矢印/タップで切替。カスタム↔プリセットはトグルで切替。
// CSSは battle.css の .ds-rail / .dsc-item / .ds-arrow / .ds-cat-toggle 系を共用（＝見た目・挙動が一致）。
import { useEffect, useRef, useState } from 'react';
import type { Deck } from '../../engine/types';
import { IMG_BIG } from '../../engine/img';
import { Icon } from '../ui/Icon';

const AURA_HEX: Record<string, string> = {
  赤: '#d2473f', 緑: '#2f9e63', 青: '#3a7fc9', 紫: '#9a57d4', 黒: '#7a8496', 黄: '#c9b03a',
};
function deckColors(d: Deck): string[] { return (d.colors || d.color || []) as string[]; }
function auraOf(d: Deck): string { return AURA_HEX[deckColors(d)[0]] || '#3ec9ff'; }

export function DeckCarousel({ customList, presetList, selectedId, onSelect }: {
  customList: Deck[];
  presetList: Deck[];
  selectedId?: string;         // 現在の選択（外部制御）。カルーセルはこれに中央を合わせる
  onSelect: (deck: Deck) => void; // 中央のデッキが変わったら通知
}) {
  const hasCustom = customList.length > 0;
  const catOf = (id?: string): 'custom' | 'preset' =>
    id && customList.some((d) => d.id === id) ? 'custom'
      : id && presetList.some((d) => d.id === id) ? 'preset'
        : hasCustom ? 'custom' : 'preset';
  const [cat, setCat] = useState<'custom' | 'preset'>(catOf(selectedId));
  const [activeIdx, setActiveIdx] = useState(0);
  const railRef = useRef<HTMLDivElement | null>(null);
  const rafPending = useRef(false);
  const ordered = cat === 'custom' ? customList : presetList;

  const centerTo = (i: number, smooth = true) => {
    const n = Math.max(0, Math.min(ordered.length - 1, i));
    setActiveIdx(n);
    const rail = railRef.current;
    const el = rail?.children[n] as HTMLElement | undefined;
    if (rail && el && typeof rail.scrollTo === 'function') {
      rail.scrollTo({ left: el.offsetLeft - (rail.clientWidth - el.clientWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
    }
  };
  const pick = (i: number) => {
    const n = Math.max(0, Math.min(ordered.length - 1, i));
    centerTo(n);
    const d = ordered[n];
    if (d) onSelect(d);
  };

  // スクロール中は rAF で間引いて中央アイテムを判定
  const onRailScroll = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const rail = railRef.current;
      if (!rail || !rail.children.length) return;
      const center = rail.scrollLeft + rail.clientWidth / 2;
      let best = 0, bd = Infinity;
      Array.from(rail.children).forEach((el, i) => {
        const h = el as HTMLElement;
        const c = h.offsetLeft + h.clientWidth / 2;
        const d = Math.abs(c - center);
        if (d < bd) { bd = d; best = i; }
      });
      if (best !== activeIdx) { setActiveIdx(best); const d = ordered[best]; if (d) onSelect(d); }
    });
  };

  // 外部から selectedId が変わった時だけ中央を合わせる（既に中央＝スクロール由来なら何もしない＝手動操作と競合しない）
  useEffect(() => {
    if (!selectedId) return;
    if (ordered[activeIdx]?.id === selectedId) return;
    const c = catOf(selectedId);
    if (c !== cat) { setCat(c); return; } // cat effect が位置合わせ
    const i = ordered.findIndex((d) => d.id === selectedId);
    if (i >= 0) centerTo(i, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // カテゴリ変更 / 件数変化: 選択デッキがあればそこへ、無ければ先頭を中央にして選択し直す
  useEffect(() => {
    if (!ordered.length) return;
    const i = selectedId ? ordered.findIndex((d) => d.id === selectedId) : -1;
    centerTo(i >= 0 ? i : 0, false);
    if (i < 0) { const d = ordered[0]; if (d) onSelect(d); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, ordered.length]);

  const active = ordered[activeIdx];
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
      <div className="ds-rail-wrap" style={active ? ({ ['--aura' as any]: auraOf(active) }) : undefined}>
        <button className="ds-arrow left" aria-label="前のデッキ" onClick={() => pick(activeIdx - 1)}><Icon.chevronLeft size={24} /></button>
        <div className="ds-rail" ref={railRef} onScroll={onRailScroll}>
          {ordered.map((d, i) => (
            <div
              key={d.id}
              className={'dsc-item' + (i === activeIdx ? ' on' : '')}
              style={{ ['--aura' as any]: auraOf(d) }}
              onClick={() => pick(i)}
            >
              {d.tier ? <div className="dsc-tier">{d.tier}</div> : null}
              <div className="art" style={{ backgroundImage: `url('${IMG_BIG(d.leader)}')` }}>
                <div className="scrim" />
                <div className="art-nm">{d.name}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="ds-arrow right" aria-label="次のデッキ" onClick={() => pick(activeIdx + 1)}><Icon.chevronRight size={24} /></button>
      </div>
    </>
  );
}

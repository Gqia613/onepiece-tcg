// 山札系の小ゾーン。元 src/40-ui-render.js の deckBlock/donDeckBlock/trashBlock/handCountHTML/pileHTML を 1:1 再現。
// kind='deck'    → ga-deck   : pile cardback（デッキ残枚数）
// kind='dondeck' → ga-dondeck: pile donp（ドンデッキ残＝donMax-(active+rested+attachedSum)）
// kind='hand'    → ga-hand   : pile cardback（相手手札枚数。元 handCountHTML）
// kind='trash'   → ga-trash  : 0枚は pile trashp / 1枚以上は trashtop+trashfan（最新画像＋hoverで全表示）
import { useEngineStore } from '../../state/engineStore';
import { IMG } from '../../engine/img';
import type { Side, Player } from '../../engine/types';

// 元 attachedSum(P): リーダー＋全キャラ＋ステージの付与ドン合計
function attachedSum(P: Player): number {
  let s = P.leader.attachedDon;
  for (const c of P.chars) s += c.attachedDon;
  if (P.stage) s += P.stage.attachedDon;
  return s;
}

export function Pile({ side, kind }: { side: Side; kind: 'deck' | 'dondeck' | 'trash' | 'hand' }) {
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // 再描画トリガ
  if (!engine) return null;
  const G = engine.G;
  const P: Player = G.players[side];

  if (kind === 'deck') {
    // 元 deckBlock: ga-deck > pile cardback
    return (
      <div className="zone-side ga-deck">
        <div className="pile cardback">
          <span className={'pc' + (P.deck.length <= 2 ? ' crit' : P.deck.length <= 5 ? ' warn' : '')}>{P.deck.length}</span>
        </div>
      </div>
    );
  }

  if (kind === 'dondeck') {
    // 元 donDeckBlock: ga-dondeck > pile donp
    const donLeft = P.donMax - (P.don.active + P.don.rested + attachedSum(P));
    return (
      <div className="zone-side ga-dondeck">
        <div className="pile donp">
          <span className="pc">{donLeft}</span>
        </div>
      </div>
    );
  }

  if (kind === 'hand') {
    // 元 handCountHTML: ga-hand > pile cardback（相手手札の枚数のみ）
    return (
      <div className="zone-side ga-hand">
        <div className="pile cardback">
          <span className="pc">{P.hand.length}</span>
        </div>
      </div>
    );
  }

  // kind === 'trash'：元 trashBlock
  const openTrash = () => useEngineStore.getState().setTrashModal(side);
  const n = P.trash.length;
  if (n === 0) {
    return (
      <div className="zone-side ga-trash">
        <div className="pile trashp" style={{ cursor: 'pointer' }} onClick={openTrash} title="トラッシュ（クリック/タップで全表示）">
          <span className="pc">0</span>
        </div>
      </div>
    );
  }
  const top = P.trash[n - 1];
  // 元: 新しい順（reverse）でファン表示
  const fan = P.trash.slice().reverse();
  return (
    <div className="zone-side ga-trash">
      <div className="trashtop" data-no={top.base.no} style={{ cursor: 'pointer' }} onClick={openTrash} title={`最新: ${top.base.name}（クリック/タップで全表示）`}>
        <img
          className="tt-img"
          src={IMG(top.base.no)}
          referrerPolicy="no-referrer"
          decoding="async"
          alt={top.base.name}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <span className="tt-fb">{top.base.name}</span>
        <span className="tt-count">{n}</span>
        <div className="trashfan">
          <div className="tf-head">トラッシュ {n}枚（新しい順）</div>
          <div className="tf-grid">
            {fan.map((c, i) => (
              <div className="tf-card" key={c.uid ?? i} title={c.base.name}>
                <img
                  src={IMG(c.base.no)}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  alt={c.base.name}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="tf-fb">{c.base.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

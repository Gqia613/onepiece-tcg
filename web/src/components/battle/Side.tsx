// 対戦盤面の片側（me/opp）。元 src/40-ui-render.js の sideHTML(side,isMe) を 1:1 再現。
// 構成順（元 sideHTML 準拠）:
//   charrow → leader(+stage) → DonRow → LifeStack → dondeck → deck → trash → (opp のみ hand)
// ハイライト/クリック判定は Card が内部処理するので opt フラグは渡さない（<Card ctx="board"/>）。
// LIFE/DON/山札は専用コンポーネント（Card を使わない）で描く。
import { AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { Card } from './Card';
import { DonRow } from './DonRow';
import { LifeStack } from './LifeStack';
import { Pile } from './Pile';
import type { Side as TSide, Player } from '../../engine/types';

export function Side({ side }: { side: TSide }) {
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // 再描画トリガ
  if (!engine) return null;
  const G = engine.G;
  const P: Player = G.players[side];
  const isMe = side === 'me';
  const chars = P.chars || [];
  // 元 charRowHTML: 残りスロット（5-len）を + で埋める
  const emptySlots = Math.max(0, 5 - chars.length);

  return (
    <div className={'side ' + (isMe ? 'me' : 'opp')}>
      {/* 元 charRowHTML: row charrow ga-chars */}
      <div className="row charrow ga-chars">
        <AnimatePresence>
          {chars.map((c) => (
            <Card key={c.uid} card={c} ctx="board" />
          ))}
        </AnimatePresence>
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div className="slot" key={`slot${i}`}>
            +
          </div>
        ))}
      </div>

      {/* 元 leaderBlock: ga-leader にリーダー、stage があれば zone-side（marginLeft:8）に */}
      <div className="ga-leader">
        <Card card={P.leader} ctx="board" />
        {P.stage ? (
          <div className="zone-side" style={{ marginLeft: 8 }}>
            <Card card={P.stage} ctx="board" />
          </div>
        ) : null}
      </div>

      {/* 元 donCostBlock */}
      <DonRow side={side} />
      {/* 元 lifeBlock */}
      <LifeStack side={side} />
      {/* 元 donDeckBlock */}
      <Pile side={side} kind="dondeck" />
      {/* 元 deckBlock */}
      <Pile side={side} kind="deck" />
      {/* 元 trashBlock */}
      <Pile side={side} kind="trash" />
      {/* 元 handCountHTML（相手側のみ） */}
      {isMe ? null : <Pile side={side} kind="hand" />}
    </div>
  );
}

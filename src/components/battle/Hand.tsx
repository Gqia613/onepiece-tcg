// 手札ゾーン。元 src/40-ui-render.js handHTML(323-331) の忠実JSX化。
// <div class="handzone" id="myhand"> に players.me.hand を <Card ctx="hand"/> で並べる。
// playable/clickable の判定とクリックは Card 内部(resolveCardClick)に委譲する＝ここでは opt を渡さない。
// AnimatePresence でドロー(enter)/プレイ(exit)の出入りをアニメーション。
import { AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { Card } from '../battle/Card';

export function Hand() {
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // 再描画トリガ（値は使わないが購読）
  if (!engine) return null;
  const G = engine.G;

  const hand = (G.players?.me?.hand ?? []) as any[];

  return (
    <div className="handzone" id="myhand">
      {hand.length === 0 ? (
        <span className="tip">手札なし</span>
      ) : (
        <AnimatePresence>
          {hand.map((c) => (
            <Card key={c.uid} card={c} ctx="hand" />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

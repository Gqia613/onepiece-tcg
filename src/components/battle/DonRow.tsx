// コストエリア（ドン置き場）。元 src/40-ui-render.js の donCostBlock を 1:1 再現。
// アクティブ=立て（usable時はクリック可の見た目）/ レスト=横 / 0枚は ghost。
// AnimatePresence + layout でドン付与・消費の出入りを滑らかに。
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { useNetStore } from '../../state/netStore';
import type { Side, Player } from '../../engine/types';

export function DonRow({ side }: { side: Side }) {
  const engine = useEngineStore((s) => s.engine);
  const mySeat = useNetStore((s) => s.mySeat);
  useEngineStore((s) => s.version); // 再描画トリガ
  if (!engine) return null;
  const G = engine.G;
  const P: Player = G.players[side];

  // 元 donCostBlock: usable = 自分 && 自分の手番 && 行動可 && !busy && !attackSel
  const mine = side === mySeat;
  const usable = mine && G.active === mySeat && G.myActable && !G.busy && !G.attackSel;

  const active = P.don.active || 0;
  const rested = P.don.rested || 0;
  const empty = active === 0 && rested === 0;

  return (
    <div className="zone-side doncost ga-cost">
      <div className="donrow">
        <AnimatePresence>
          {empty ? (
            <div className="doncard ghost" />
          ) : (
            <>
              {Array.from({ length: active }).map((_, i) => (
                <motion.div
                  key={`a${i}`}
                  className={'doncard' + (usable ? ' usable' : '')}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                >
                  D
                </motion.div>
              ))}
              {Array.from({ length: rested }).map((_, i) => (
                <motion.div
                  key={`r${i}`}
                  className="doncard rest"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                >
                  D
                </motion.div>
              ))}
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

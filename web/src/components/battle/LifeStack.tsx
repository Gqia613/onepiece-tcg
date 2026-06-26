// ライフ（一番左・横向き積み）。元 src/40-ui-render.js の lifeBlock を 1:1 再現。
// z-index: cpu側= i+1（上から下へ重ね）／ me側= len-i（下から上＝index0が前面＝次に取られる札）。
// _faceUp の札は lifecard up（回転画像＋名前ラベル lf-fb）、裏向きは空の lifecard。0枚なら zero。
// AnimatePresence でライフ減少（exit）を滑らかに。
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG_ROT } from '../../engine/img';
import type { Side, Player } from '../../engine/types';

export function LifeStack({ side }: { side: Side }) {
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // 再描画トリガ
  if (!engine) return null;
  const G = engine.G;
  const P: Player = G.players[side];
  const life = P.life || [];
  const len = life.length;
  const isCpu = side === 'cpu';

  return (
    <div className="zone-side ga-life">
      <div className="lifestack">
        {len === 0 ? (
          <span className="zero">0</span>
        ) : (
          <AnimatePresence>
            {life.map((c, i) => {
              // 元 lifeBlock の z 算出：cpu= i+1 / me= len-i
              const z = isCpu ? i + 1 : len - i;
              const key = (c && c.uid != null ? c.uid : `l${i}`) as React.Key;
              if (c && c._faceUp) {
                return (
                  <motion.div
                    key={key}
                    className="lifecard up"
                    style={{ zIndex: z }}
                    data-no={c.base.no}
                    title={`${c.base.name}（表向き）`}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: -24, scale: 0.7 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  >
                    <img
                      src={IMG_ROT(c.base.no)}
                      referrerPolicy="no-referrer"
                      decoding="async"
                      alt={c.base.name}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="lf-fb">{c.base.name}</span>
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={key}
                  className="lifecard"
                  style={{ zIndex: z }}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, x: -24, scale: 0.7 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                />
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

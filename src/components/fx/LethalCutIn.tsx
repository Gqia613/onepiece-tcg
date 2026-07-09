// リーサル（トドメの一撃）カットイン。エンジンの lethalFx フック（reactAdapter 実装）が
// store.lethal をセットしている間だけ表示される全画面オーバーレイ。
// 暗転 → 「FINISH!!」が斜めにスラムイン → 衝撃リング。操作は透過（pointer-events:none）。
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';

export function LethalCutIn() {
  const lethal = useEngineStore((s) => s.lethal);
  return (
    <AnimatePresence>
      {lethal ? (
        <motion.div
          key="lethal"
          className={'lethal-cut ' + (lethal === 'cpu' ? 'mine' : 'opp')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <div className="lc-dim" />
          <div className="lc-band" />
          <motion.div
            className="lc-txt"
            initial={{ scale: 2.6, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: -6, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
          >
            FINISH!!
          </motion.div>
          <div className="lc-ring" />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

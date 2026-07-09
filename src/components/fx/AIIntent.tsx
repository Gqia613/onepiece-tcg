// CPUがClaude(AI)に相談して立てた方針(G._aiIntent)を表示。AIが効いている実感を出すための可視化。
// aiThink が intent をセット→ showAIIntent が render()→ ここが engine.G._aiIntent を読んで表示。
import { AnimatePresence, motion } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { Icon } from '../ui/Icon';

export function AIIntent() {
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // 再描画トリガ
  const G = engine?.G;
  const intent: string | null = (G && G.inGame && G.aiOn && G._aiIntent) || null;

  return (
    <AnimatePresence>
      {intent ? (
        <motion.div
          key={intent}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          style={{
            // fx-note 群(top:56)と段をずらし、盤面要素より前に出す
            position: 'fixed', top: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 8900,
            maxWidth: '86vw', padding: '6px 14px', borderRadius: 999, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(20,40,60,.95), rgba(10,28,41,.95))',
            border: '1px solid var(--gold-dim)', color: 'var(--gold-soft)', fontSize: 12.5, fontWeight: 700,
            boxShadow: '0 8px 24px #0008', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          <Icon.cpu size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />CPUの狙い: <span style={{ color: 'var(--ink)' }}>{intent}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

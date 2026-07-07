// AI思考中バッジ（元 src/40-ui-render.js showThinking() を踏襲）。
// store.thinking を購読し、true の間だけ画面上部中央に固定バッジを出す。
// 元 showThinking は body 直付けの #aiThinking に inline スタイルを当てていた（CSS class 無し）ので、
// ここでも当時の見た目（丸ピル・半透明ネイビー・薄青文字）を inline で 1:1 再現しつつ、
// 🤖 アイコンを回転、バッジ全体をパルスさせ、false で AnimatePresence によりフェードアウトする。
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { Icon } from '../ui/Icon';

export function Thinking() {
  const thinking = useEngineStore((s) => s.thinking);

  return (
    <AnimatePresence>
      {thinking && (
        <motion.div
          key="aiThinking"
          id="aiThinking"
          // 元 showThinking の inline cssText を踏襲（CSS class は元々無い）。
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            zIndex: 9000,
            background: 'rgba(12,18,30,.86)',
            color: '#cfe3ff',
            font: '600 14px/1.3 "Noto Sans JP",sans-serif',
            padding: '9px 18px',
            borderRadius: 999,
            border: '1px solid rgba(120,170,255,.4)',
            boxShadow: '0 4px 18px rgba(0,0,0,.4)',
            letterSpacing: '.04em',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
          initial={{ opacity: 0, y: -10, x: '-50%', scale: 0.9 }}
          animate={{
            opacity: 1,
            y: 0,
            x: '-50%',
            // ふわっと脈打つパルス
            scale: [1, 1.05, 1],
          }}
          exit={{ opacity: 0, y: -10, x: '-50%', scale: 0.9 }}
          transition={{
            opacity: { duration: 0.28 },
            y: { type: 'spring', stiffness: 300, damping: 22 },
            scale: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          <motion.span
            // 🤖 をくるくる回す
            animate={{ rotate: 360 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
            style={{ display: 'inline-block', fontSize: 16, lineHeight: 1 }}
          >
            <Icon.cpu size={16} />
          </motion.span>
          <span>AI思考中…</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

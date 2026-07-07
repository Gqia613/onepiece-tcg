// ライフからトリガーカードが公開された瞬間の派手な演出オーバーレイ。
// store.trigger（TriggerRevealState|null）を購読し、被弾側(me=下/cpu=上)からカードが
// 飛び込み → 3D フリップ → 金色の放射光線・稲妻・パーティクル・「⚡トリガー!!」で大きく見せる。
// 全体 pointer-events:none（下のプロンプト/盤面操作を妨げない）。fixed inset:0・z-index 54
// （.prompt=50/55 の直下＝人間の発動確認中もカード大写しが背後に残る）。
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { IMG_BIG, IMG_RAW } from '../../engine/img';

// カード画像（weserv 失敗時 raw へフォールバック。AtkAnnounce の AaCard と同じ作法）。
function TrigCard({ no }: { no: string }) {
  return (
    <img
      className="trig-card-img"
      src={IMG_BIG(no)}
      referrerPolicy="no-referrer"
      decoding="async"
      alt=""
      onError={(e) => {
        const el = e.currentTarget;
        if (el.dataset.fb) { el.style.display = 'none'; return; }
        el.dataset.fb = '1';
        el.src = IMG_RAW(no);
      }}
    />
  );
}

// カード周囲で明滅する稲妻（viewBox 0..100 の相対パス）。
const BOLTS = ['M50 0 L40 44 L55 42 L42 100', 'M50 3 L61 40 L47 43 L58 97'];

export function TriggerReveal() {
  const trigger = useEngineStore((s) => s.trigger);
  const fromY = trigger && trigger.side === 'me' ? 170 : -170; // 自分のライフ=下/相手=上から飛び込む

  return (
    <AnimatePresence>
      {trigger && (
        <motion.div
          key="trigReveal"
          className="trig-reveal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.18 }}
        >
          {/* 暗転ビネット＋金色フラッシュ */}
          <div className="trig-backdrop" />
          <div className="trig-flash" />

          {/* 回転する金色の放射光線 */}
          <motion.div
            className="trig-rays"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 16 }}
          />

          {/* カード大写し（下/上から飛び込み → 3D フリップ → ゆっくり浮遊） */}
          <div className="trig-stage">
            <motion.div
              className="trig-card"
              initial={{ y: fromY, rotateY: -100, scale: 0.7, opacity: 0 }}
              animate={{
                y: [fromY, 0, 0, -8, 0],
                rotateY: [-100, 0, 0, 0, 0],
                scale: [0.7, 1.08, 1, 1, 1],
                opacity: 1,
              }}
              transition={{ duration: 1.1, times: [0, 0.42, 0.5, 0.78, 1], ease: 'easeOut' }}
            >
              <TrigCard no={trigger.no} />
              {/* 稲妻 */}
              <svg className="trig-bolts" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {BOLTS.map((d, i) => (
                  <path key={i} d={d} className={'trig-bolt b' + i} />
                ))}
              </svg>
              {/* 放射状に飛散するパーティクル */}
              <div className="trig-particles">
                {Array.from({ length: 14 }).map((_, i) => (
                  <i key={i} style={{ ['--a' as string]: (i / 14) * 360 + 'deg' } as React.CSSProperties} />
                ))}
              </div>
            </motion.div>
          </div>

          {/* 「⚡ トリガー!!」テキスト＋カード名（スラムイン） */}
          <motion.div
            className="trig-title"
            initial={{ scale: 3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.32 }}
          >
            <span className="trig-title-lbl">⚡ トリガー!!</span>
            {trigger.name ? <span className="trig-title-nm">{trigger.name}</span> : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

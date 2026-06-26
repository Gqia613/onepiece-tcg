// ターン切替バナー（元 src/30-flow-battle.js banner() / 40-ui-render.js banner()・CSS .turnbanner を踏襲）。
// エンジンに専用フックが無い（banner FxEvent はエンジンからは飛んでこない設計）ので、
// store.version を購読して engine.G.active / G.turnDisp の変化を useRef で自前検知し、
// ターンが切り替わった瞬間だけ中央に scale+opacity で約1.6s 表示する（AnimatePresence で自動退場）。
//
// 元 .turnbanner の class（mine/opp）に乗せれば色（self-accent/opp-accent）が自動で当たる。
// 元 CSS の tbnr keyframes は Framer の transform と競合するので animation:none で上書きし、
// motion 側で 0.7→1→1.12 / opacity の山を再現する。
import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import type { Side } from '../../engine/types';

interface BannerItem {
  key: number;     // 連番（同テキスト連続でも再マウントさせる）
  text: string;
  side: Side;      // mine/opp の色分け
}

const HOLD_MS = 1600;

export function Banner() {
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // 値は使わないが購読（再描画＝検知のトリガ）

  // 直近に観測したターン識別子（active + turnDisp の合成）。初期 null＝初回は出さない。
  const lastKeyRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const toRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [item, setItem] = useState<BannerItem | null>(null);

  // 変化検知は描画後に行う（render 中の setState を避ける）
  useEffect(() => {
    if (!engine) return;
    const G = engine.G;
    if (!G || !G.inGame) return;
    const active: Side | undefined = G.active;
    if (active !== 'me' && active !== 'cpu') return;

    // ターンの一意キー。turnDisp が無くても turnSeq/active で代替。
    const curKey = String(G.turnDisp ?? G.turnSeq ?? '') + ':' + active;
    const prev = lastKeyRef.current;
    lastKeyRef.current = curKey;

    // 初回観測（prev===null）はバナーを出さない＝盤面初期化のチラ出し防止
    if (prev === null || prev === curKey) return;

    const text = active === 'me' ? 'あなたのターン' : '相手のターン';
    const key = ++seqRef.current;
    setItem({ key, text, side: active });

    if (toRef.current) clearTimeout(toRef.current);
    toRef.current = setTimeout(() => {
      // 自分が出した最新バナーのときだけ消す（後続に上書きされていたら触らない）
      setItem((cur) => (cur && cur.key === key ? null : cur));
      toRef.current = null;
    }, HOLD_MS);
  });

  // アンマウント時にタイマー後始末
  useEffect(() => () => { if (toRef.current) clearTimeout(toRef.current); }, []);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key={item.key}
          className={'turnbanner ' + (item.side === 'me' ? 'mine' : 'opp')}
          // 元 CSS の tbnr keyframes（animation）は Framer の transform と競合するので無効化
          style={{ animation: 'none' }}
          initial={{ opacity: 0, x: '-50%', y: '-50%', scale: 0.7 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: '-50%',
            y: '-50%',
            scale: [0.7, 1, 1, 1.12],
          }}
          exit={{ opacity: 0, x: '-50%', y: '-50%', scale: 1.12 }}
          transition={{ duration: HOLD_MS / 1000, times: [0, 0.16, 0.78, 1], ease: 'easeOut' }}
        >
          {item.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// アタック宣言演出。強化版（元 src/40-ui-render.js showAtkAnnounce を踏襲）。
// 元の #atkAnnounce / .aa-* class を 1:1 で再現しつつ Framer で強化:
//  ・攻撃側(aSide)から見て下(me)/上(cpu)からスライドイン
//  ・phase で見た目変化 declare(両者表示)/block(盾アイコン強調)/damage(最終パワー)
//  ・パワー数値は motion(useSpring) で補間
import { useEffect } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { Icon } from '../ui/Icon';
import { IMG, IMG_RAW } from '../../engine/img';
import type { Card } from '../../engine/types';

// パワー値を補間表示する小コンポーネント（aa-pw チップ内の数値）
function AnimPower({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 180, damping: 22, mass: 0.6 });
  useEffect(() => { spring.set(value); }, [value, spring]);
  const text = useTransform(spring, (v) => 'P' + Math.round(v));
  return <motion.span>{text}</motion.span>;
}

// aa-card 画像（weserv 失敗時 raw へフォールバック）
function AaCard({ no }: { no: string }) {
  return (
    <img
      className="aa-card"
      src={IMG(no)}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={(e) => {
        const el = e.currentTarget;
        if (el.dataset.fb) { el.style.display = 'none'; return; }
        el.dataset.fb = '1';
        el.src = IMG_RAW(no);
      }}
    />
  );
}

export function AtkAnnounce() {
  const engine = useEngineStore((s) => s.engine);
  const atk = useEngineStore((s) => s.atk);
  const trigger = useEngineStore((s) => s.trigger);
  const prompt = useEngineStore((s) => s.prompt);
  useEngineStore((s) => s.version); // 再描画トリガ（power 再評価のため）

  if (!engine || !atk) return null;
  // トリガー公開演出中はアタック宣言を出さない（このアタックは解決済み）。
  if (trigger) return null;
  // 何らかのプロンプト表示中は、攻撃情報をモーダル上部(AttackHead)に統合表示するので
  // 浮動ダイアログは出さない。「盤面を見る」(peek)退避中も出さない＝盤面を隠すものはゼロにする
  // （誰が誰を攻撃中かは盤面の攻撃ライン＋カードの発光で分かる）。
  if (prompt) return null;
  const { aSide, attacker, target, phase } = atk;
  if (!attacker || !target) return null;

  const opp = aSide !== 'me';
  const power = (c: Card): number => {
    try { return (engine.power(c) as number) ?? 0; } catch { return 0; }
  };
  const ap = power(attacker);
  const dp = power(target);

  // 防御対象名（リーダーは視点で言い換え。元 showAtkAnnounce 準拠）
  const toN =
    target.base.type === 'LEADER'
      ? opp ? 'あなたのリーダー' : '相手のリーダー'
      : target.base.name;

  // 攻撃側から見て下(me)/上(cpu)からスライドイン
  const fromY = opp ? -54 : 54;

  return (
    <AnimatePresence>
      <motion.div
        key="atkAnnounce"
        id="atkAnnounce"
        className={opp ? 'opp' : undefined}
        // 元 CSS の atkAnn keyframes は Framer の transform と競合するため上書き（animation:none）
        style={{ animation: 'none' }}
        initial={{ opacity: 0, x: '-50%', y: fromY, scale: 0.82 }}
        animate={{
          opacity: 1,
          x: '-50%',
          y: 0,
          scale: phase === 'damage' ? 1.06 : 1,
        }}
        exit={{ opacity: 0, x: '-50%', y: fromY * 0.5, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      >
        {opp && <span className="aa-side">相手</span>}

        {/* 攻撃側 */}
        <motion.span
          className="aa-from"
          animate={{ scale: phase === 'damage' ? 1.08 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <AaCard no={attacker.base.no} />
          <span className="aa-nm">{attacker.base.name}</span>
          <b className="aa-pw"><AnimPower value={ap} /></b>
        </motion.span>

        {/* 中央: declare/damage は矢印、block は盾を強調 */}
        <motion.span
          className="aa-arrow"
          key={phase === 'block' ? 'shield' : 'arrow'}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{
            scale: phase === 'block' ? 1.35 : 1,
            opacity: 1,
            rotate: phase === 'block' ? [0, -12, 12, 0] : 0,
          }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        >
          {phase === 'block' ? <Icon.shield size={30} /> : <Icon.swords size={30} />}
        </motion.span>

        {/* 防御側 */}
        <motion.span
          className="aa-to"
          animate={{ scale: phase === 'block' ? 1.06 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <AaCard no={target.base.no} />
          <span className="aa-nm">{toN}</span>
          <b className="aa-pw def"><AnimPower value={dp} /></b>
        </motion.span>
      </motion.div>
    </AnimatePresence>
  );
}

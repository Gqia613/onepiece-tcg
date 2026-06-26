// 盤面/手札の1カード。中核コンポーネント。
// ★アニメ構造（堅牢化）:
//   外側 motion.div = 宣言的 initial/animate/exit（毎レンダーで必ず steady へ駆動＝opacity0で固まらない）
//   内側 motion.div = 一時アニメ(lunge/shake/dmg/ko)を useAnimationControls で。transformが外側と競合しない。
// transform は全て motion 管理（CSS .card.rest の rotate は使わず animate の rotate で表現）。
import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { resolveCardClick, atkGlow, type CardCtx } from '../../engine/interaction';
import { IMG, IMG_RAW } from '../../engine/img';
import type { Card as TCard } from '../../engine/types';

const COLOR_HEX: Record<string, string> = {
  赤: '#d2473f', 緑: '#2f9e63', 青: '#3a7fc9', 紫: '#9a57d4', 黒: '#5a6170', 黄: '#c9b03a',
};
const KW_SHORT: Record<string, string> = { blocker: 'B', rush: '速', doubleAttack: 'W', banish: 'バ', unblockable: '貫' };

export function Card({ card, ctx }: { card: TCard; ctx: CardCtx }) {
  const engine = useEngineStore((s) => s.engine)!;
  const pick = useEngineStore((s) => s.pick);
  const prompt = useEngineStore((s) => s.prompt);
  useEngineStore((s) => s.version); // 再描画トリガ
  const fxQueue = useEngineStore((s) => s.fxQueue);
  const removeFx = useEngineStore((s) => s.removeFx);

  const fx = useAnimationControls(); // 内側の一時アニメ用
  const [imgStage, setImgStage] = useState(0); // 0=weserv,1=raw,2=fallback
  const seenAnim = useRef<Set<number>>(new Set());
  // タッチ長押し→カード詳細モーダル（H6）。長押し発火後の click は1回無視。
  const lpTimer = useRef<any>(null);
  const lpFired = useRef(false);
  const lpStart = useRef<{ x: number; y: number } | null>(null);

  const b = card.base;
  const rot = card.rested ? (card.owner === 'cpu' ? -90 : 90) : 0;
  const showPow = b.type === 'CHAR' || b.type === 'LEADER';
  const beh = resolveCardClick(engine, pick, prompt, card, ctx);
  const glow = atkGlow(engine, card);

  // animClass 由来の一時アニメ（内側 fx へ。外側の steady とは独立）
  useEffect(() => {
    const ev = fxQueue.find((f) => f.type === 'anim' && f.uid === card.uid && !seenAnim.current.has(f.id)) as
      | { id: number; cls: string }
      | undefined;
    if (!ev) return;
    seenAnim.current.add(ev.id);
    removeFx(ev.id);
    runAnim(ev.cls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxQueue]);

  async function runAnim(cls: string) {
    const up = card.owner === 'cpu' ? 1 : -1;
    try {
      if (cls.indexOf('lunge') === 0 || cls === 'attack') {
        await fx.start({ y: [0, up * 26, 0], scale: [1, 1.06, 1], transition: { duration: 0.42 } });
      } else if (cls === 'shake') {
        await fx.start({ x: [0, -5, 5, -5, 5, 0], transition: { duration: 0.4 } });
      } else if (cls === 'dmg' || cls === 'dmgflash') {
        await fx.start({ filter: ['brightness(1)', 'brightness(2.2)', 'brightness(1)'], transition: { duration: 0.5 } });
      } else if (cls === 'ko' || cls === 'koanim') {
        await fx.start({ scale: [1, 1.1, 0.9], transition: { duration: 0.3 } });
      }
    } catch { /* ignore */ }
    fx.start({ x: 0, y: 0, scale: 1, filter: 'none', transition: { duration: 0.12 } });
  }

  const classes = ['card'];
  if (b.type === 'LEADER') classes.push('leader');
  if (card.rested) classes.push('rest');
  if (card.owner === 'cpu' && card.rested) classes.push('flip');
  if (beh.highlight) classes.push(beh.highlight === 'danger' ? 'selectable danger-sel' : beh.highlight);
  if (glow) classes.push(glow);
  if (beh.clickable) classes.push('clickable');

  const kwChips: string[] = [];
  (['blocker', 'rush', 'doubleAttack', 'banish'] as const).forEach((k) => {
    if ((b as any)[k] || (card.kwGrant || []).some((g) => g.kw === k)) kwChips.push(KW_SHORT[k]);
  });

  const colorHex = COLOR_HEX[(b.color && b.color[0]) as string] || '#1a2c3c';
  const src = imgStage === 0 ? IMG(card.no) : imgStage === 1 ? IMG_RAW(card.no) : '';

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]; if (!t) return;
    lpFired.current = false; lpStart.current = { x: t.clientX, y: t.clientY };
    clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      lpFired.current = true;
      useEngineStore.getState().setCardModal(card);
      if ((navigator as any).vibrate) { try { (navigator as any).vibrate(12); } catch { /* ignore */ } }
    }, 450);
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0]; if (!t || !lpStart.current) return;
    if (Math.abs(t.clientX - lpStart.current.x) > 10 || Math.abs(t.clientY - lpStart.current.y) > 10) { clearTimeout(lpTimer.current); lpTimer.current = null; }
  }
  function onTouchEnd() { clearTimeout(lpTimer.current); lpTimer.current = null; }
  function onClick() { if (lpFired.current) { lpFired.current = false; return; } beh.onClick && beh.onClick(); }

  return (
    <motion.div
      className={classes.join(' ')}
      data-uid={card.uid}
      data-no={card.no}
      initial={{ opacity: 0, scale: 0.78, y: ctx === 'hand' ? 24 : 12, rotate: rot }}
      animate={{ opacity: 1, scale: 1, y: 0, rotate: rot }}
      exit={{ opacity: 0, scale: 0.5, rotate: rot + 16 }}
      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
      whileHover={ctx === 'hand' ? { y: -20, scale: 1.12, zIndex: 30, transition: { duration: 0.12 } } : undefined}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      // ホバーで効果プレビュー（hover専用スライス更新＝Card自身は再購読しないので再描画されない）
      onMouseEnter={() => useEngineStore.getState().setHover(card)}
      onMouseLeave={() => { if (useEngineStore.getState().hover === card) useEngineStore.getState().setHover(null); }}
      title={b.name}
    >
      {/* 内側: 一時アニメ層（lunge/shake/dmg）。レイアウト・enter/exit には影響しない */}
      <motion.div animate={fx} style={{ width: '100%', height: '100%', position: 'relative' }}>
        {imgStage < 2 && (
          <img
            src={src}
            referrerPolicy="no-referrer"
            decoding="async"
            alt={b.name}
            onError={() => setImgStage((s) => s + 1)}
          />
        )}
        {imgStage === 2 && (
          <div className="fallback" style={{ ['--cc' as any]: colorHex, display: 'flex' }}>
            <div className="fb-top">
              <span className="cost">{b.cost != null ? b.cost : '-'}</span>
              {b.counter ? <span className="ctr">C{b.counter}</span> : null}
            </div>
            <div className="nm">{b.name}</div>
            <div className="typ">
              {typeJa(b.type)}
              {b.traits && b.traits.length ? ' / ' + b.traits[0] : ''}
            </div>
            {showPow && b.power != null ? <div className="pw">{b.power}</div> : null}
          </div>
        )}
        {showPow ? <div className="cnr-power">{safePow(engine, card)}</div> : null}
        {card.attachedDon > 0 ? <div className="donbadge">+{card.attachedDon}</div> : null}
        {kwChips.length ? (
          <div className="kw">{kwChips.map((k, i) => <span key={i}>{k}</span>)}</div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

function typeJa(t: string) {
  return ({ CHAR: 'キャラ', EVENT: 'イベント', STAGE: 'ステージ', LEADER: 'リーダー' } as any)[t] || t;
}
function safePow(engine: any, card: TCard): number {
  try { return engine.power(card); } catch { return card.base.power || 0; }
}

// ターン切替バナー（元 src/40-ui-render.js banner()・新 "ABYSS NEON" の .turnbanner を踏襲）。
// エンジンに専用フックが無い（banner FxEvent はエンジンから飛ばない設計）ので、store.version を
// 購読して engine.G.active / G.turnDisp の変化を useRef で自前検知し、切替の瞬間だけ表示する。
//
// ★新 .turnbanner は全幅 flex 中央寄せ＋子要素 .tb-band(帯)/.tb-txt(文字) を CSS keyframes
//   (tbnrFade/tbnrBand/tbnrTxt) で animate する設計。旧版の Framer 手動アニメは廃し、raw と同じく
//   .flash クラスで CSS アニメを発火させる（マウント＝新要素なので 1 回再生され、HOLD_MS 後に unmount）。
import { useRef, useState, useEffect } from 'react';
import { useEngineStore } from '../../state/engineStore';
import { useNetStore } from '../../state/netStore';
import { playSfx } from '../../audio';
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

    const curKey = String(G.turnDisp ?? G.turnSeq ?? '') + ':' + active;
    const prev = lastKeyRef.current;
    lastKeyRef.current = curKey;

    // 初回観測（prev===null）はバナーを出さない＝盤面初期化のチラ出し防止
    if (prev === null || prev === curKey) return;

    const mySeat = useNetStore.getState().mySeat;
    const text = active === mySeat ? 'あなたのターン' : '相手のターン';
    const key = ++seqRef.current;
    setItem({ key, text, side: active });
    if (active === mySeat) playSfx('turnstart'); // 自分のターン開始ジングル（muted/未unlockはplaySfx側で無音）

    if (toRef.current) clearTimeout(toRef.current);
    toRef.current = setTimeout(() => {
      setItem((cur) => (cur && cur.key === key ? null : cur));
      toRef.current = null;
    }, HOLD_MS);
  });

  useEffect(() => () => { if (toRef.current) clearTimeout(toRef.current); }, []);

  if (!item) return null;
  // key で毎回 remount＝.flash の CSS アニメ(tbnrFade/Band/Txt)が先頭から再生される。
  return (
    <div key={item.key} className={'turnbanner flash ' + (item.side === useNetStore.getState().mySeat ? 'mine' : 'opp')}>
      <span className="tb-band" />
      <span className="tb-txt">{item.text}</span>
    </div>
  );
}

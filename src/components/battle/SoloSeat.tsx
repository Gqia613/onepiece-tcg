// 1人回し（solo）の席追従。
//
// 盤面の操作権・視点反転（自席=画面下段・Hand=自席の手札・interaction のクリック判定）は
// すべて netStore.mySeat 基準で動く。したがって「相手のターンも自分で操作する」モードは
//   mySeat を “いま手番の席” へ自動で反転させるだけ
// で実現できる（エンジンは startGame({cpuHuman:true}) で両席とも人間＝CPU AI を一切走らせない）。
//
// ★反転はターンの境界だけで行う（防御=ブロック/カウンターの最中には反転させない）。
//   防御側の判断はプロンプトの選択肢（カード画像付き＝候補は全部出る）で完結するので、
//   1回のアタックで盤面が何度も回転するのを避ける方が読みやすい。
import { useEffect } from 'react';
import { useEngineStore } from '../../state/engineStore';
import { useNetStore } from '../../state/netStore';
import type { Side } from '../../engine/types';

// いま操作すべき席＝手番側。対戦していないときは null（席を動かさない）。
export function soloSeatFor(G: any): Side | null {
  if (!G || !G.inGame || !G.players) return null;
  return G.active === 'cpu' ? 'cpu' : 'me';
}

export function SoloSeat() {
  const solo = useNetStore((s) => s.solo);
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // G.active の変化（render→bump）を拾う

  // 依存配列なし＝毎レンダー後に照合（Banner と同型）。setMySeat は差分がある時だけ呼ぶ。
  useEffect(() => {
    if (!solo || !engine) return;
    const net = useNetStore.getState();
    // 保険: オンライン/観戦/リプレイでは席はサーバ（や再生データ）が持つ＝絶対に動かさない
    if (net.mode === 'online' || net.spectating || net.replayActive) return;
    const want = soloSeatFor(engine.G);
    if (!want) return;
    if (net.mySeat !== want) net.setMySeat(want);
  });

  return null;
}

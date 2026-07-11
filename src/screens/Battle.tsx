// 対戦画面（盤面のみ）。元 render()（src/40-ui-render.js:417-433）の #board>.felt 構造を忠実再現。
// 演出オーバーレイ群は App 側（#screen の外＝body相当）にマウントする（クリップ防止）。
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import { Side } from '../components/battle/Side';
import { Hand } from '../components/battle/Hand';
import { Controls } from '../components/battle/Controls';

export default function Battle() {
  const engine = useEngineStore((s) => s.engine);
  const pick = useEngineStore((s) => s.pick);
  const mySeat = useNetStore((s) => s.mySeat);
  useEngineStore((s) => s.version); // 再描画トリガ
  if (!engine) return null;
  const G = engine.G;
  const oppSeat = mySeat === 'me' ? 'cpu' : 'me';

  // 自席の選択中だけ盤面を減光（相手の選択中は通常表示のまま観戦）
  const myPick = pick && (!pick.side || pick.side === mySeat) ? pick : null;
  const pinch = !!(G.inGame && !G.winner && G.players?.[mySeat]?.life && G.players[mySeat].life.length <= 1);
  const feltCls =
    'felt' +
    (myPick ? ' picking' : '') +
    (G.attackSel ? ' selecting' : '') +
    (pinch ? ' pinch' : '') + // 残ライフ1以下＝画面縁が赤く明滅（緊張の可視化）
    (myPick && myPick.uids && myPick.uids.size >= 4 ? ' many-sel' : '');

  return (
    <div id="board">
      <div className={feltCls}>
        <Side side={oppSeat} />
        <div className="midline"><span className="vs">VS</span></div>
        <Side side={mySeat} />
        <Hand />
        <Controls />
      </div>
    </div>
  );
}

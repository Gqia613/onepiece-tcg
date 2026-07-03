// 対戦画面（盤面のみ）。元 render()（src/40-ui-render.js:417-433）の #board>.felt 構造を忠実再現。
// 演出オーバーレイ群は App 側（#screen の外＝body相当）にマウントする（クリップ防止）。
import { useEngineStore } from '../state/engineStore';
import { Side } from '../components/battle/Side';
import { Hand } from '../components/battle/Hand';
import { Controls } from '../components/battle/Controls';

export default function Battle() {
  const engine = useEngineStore((s) => s.engine);
  const pick = useEngineStore((s) => s.pick);
  useEngineStore((s) => s.version); // 再描画トリガ
  if (!engine) return null;
  const G = engine.G;

  const feltCls =
    'felt' +
    (pick ? ' picking' : '') +
    (G.attackSel ? ' selecting' : '') +
    (pick && pick.uids && pick.uids.size >= 4 ? ' many-sel' : '');

  return (
    <div id="board">
      <div className={feltCls}>
        <Side side="cpu" />
        <div className="midline"><span className="vs">VS</span></div>
        <Side side="me" />
        <Hand />
        <Controls />
      </div>
    </div>
  );
}

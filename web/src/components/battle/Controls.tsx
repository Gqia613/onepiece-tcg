// コントロール行。元 src/40-ui-render.js controlsHTML(341-367) の忠実JSX化。
// <div class="controls"> に状況別UIを出す:
//  - G.winner       : 「もう一度プレイ」(.phasebtn.go → engine.backToSelect)
//  - 自分メイン中    : attackSel あり → 攻撃ヒントバー(.hintbar.atk)＋「取消」(.phasebtn.ghost → cancelAttackSel)
//                      attackSel なし → 「ターン終了」(.phasebtn.go → uiEndTurn)
//  - それ以外        : 「CPU 思考中 / 処理中」(.thinking + .dots)
// 元のクラス名・文言・DOM階層を1:1で踏襲（onclick属性は React の onClick + engine 呼び出しへ置換）。
// 自分メイン判定は元の !G.promptState && !G.pendingChoice を store の !prompt && !pick で代替する。
import { useEngineStore } from '../../state/engineStore';

export function Controls() {
  const engine = useEngineStore((s) => s.engine);
  const prompt = useEngineStore((s) => s.prompt);
  const pick = useEngineStore((s) => s.pick);
  useEngineStore((s) => s.version); // 再描画トリガ（値は使わないが購読）
  if (!engine) return null;
  const G = engine.G;

  // 勝敗確定：もう一度プレイ
  if (G.winner) {
    return (
      <div className="controls">
        <button className="phasebtn go" onClick={() => engine.backToSelect()}>
          もう一度プレイ
        </button>
      </div>
    );
  }

  // 自分のメイン（操作可能・モーダル/選択待ちでない）
  if (G.active === 'me' && G.myActable && !G.busy && !prompt && !pick) {
    // アタック対象選択中：ヒントバー＋取消
    if (G.attackSel) {
      let tgts = 0;
      try {
        tgts = engine.legalTargets('me', G.attackSel.attacker).length;
      } catch {
        tgts = 0;
      }
      return (
        <div className="controls">
          <div className="hintbar atk">
            <span className="hb-lead">⚔ 攻撃対象を選択</span>
            <span className="hb-chip warn">
              対象 <b>{tgts}</b>
            </span>
            <span className="hb-tip">光る相手カードをクリック／攻撃キャラ再クリックで取消</span>
          </div>
          <button className="phasebtn ghost" onClick={() => engine.cancelAttackSel()}>
            取消
          </button>
        </div>
      );
    }

    // 通常のメイン：ヒントバー（元 controlsHTML 357-364）＋ターン終了
    const P = G.players.me;
    const safeCount = (fn: () => number) => { try { return fn(); } catch { return 0; } };
    const playN = safeCount(() => P.hand.filter((c: any) => engine.handPlayable(c)).length);
    const atkN = safeCount(() => [P.leader, ...P.chars].filter((c: any) => engine.canCardAttack(c)).length);
    const actN = safeCount(
      () => [...P.chars, ...(P.stage ? [P.stage] : [])]
        .filter((c: any) => c.base.fx && c.base.fx.act && c._actTurn !== G.turnSeq).length,
    );
    const chip = (cls: string, label: string, n: number) => (
      <span className={'hb-chip' + (n ? '' : ' zero') + (cls ? ' ' + cls : '')}>
        {label} <b>{n}</b>
      </span>
    );
    return (
      <div className="controls">
        <div className="hintbar">
          <span className="hb-lead">あなたのメイン</span>
          <span className="hb-chip don">⛏ ドン <b>{P.don.active}</b></span>
          {chip('', '🃏 出せる手札', playN)}
          {chip('', '⚔ アタック可', atkN)}
          {actN ? chip('act', '✦ 起動', actN) : null}
          <span className="hb-tip">光る手札=登場/使用・光る自分のカード=アタック/ドン付与/起動</span>
        </div>
        <button className="phasebtn go" onClick={() => engine.uiEndTurn()}>
          ターン終了
        </button>
      </div>
    );
  }

  // それ以外：思考中/処理中
  return (
    <div className="controls">
      <span className="thinking">
        <span>{G.active === 'cpu' ? 'CPU 思考中' : '処理中'}</span>
        <span className="dots">
          <span>●</span>
          <span>●</span>
          <span>●</span>
        </span>
      </span>
    </div>
  );
}

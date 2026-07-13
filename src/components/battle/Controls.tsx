// コントロール行。元 src/40-ui-render.js controlsHTML(341-367) の忠実JSX化。
// <div class="controls"> に状況別UIを出す:
//  - G.winner       : 「もう一度プレイ」(.phasebtn.go → engine.backToSelect)
//  - 自分メイン中    : attackSel あり → 攻撃ヒントバー(.hintbar.atk)＋「取消」(.phasebtn.ghost → cancelAttackSel)
//                      attackSel なし → 「ターン終了」(.phasebtn.go → uiEndTurn)
//  - それ以外        : 「CPU 思考中 / 処理中」(.thinking + .dots)
// 元のクラス名・文言・DOM階層を1:1で踏襲（onclick属性は React の onClick + engine 呼び出しへ置換）。
// 自分メイン判定は元の !G.promptState && !G.pendingChoice を store の !prompt && !pick で代替する。
import { useNavigate } from 'react-router-dom';
import { useEngineStore } from '../../state/engineStore';
import { useNetStore } from '../../state/netStore';
import { uiDispatch } from '../../net/dispatch';
import { Icon } from '../ui/Icon';

export function Controls() {
  const navigate = useNavigate();
  const engine = useEngineStore((s) => s.engine);
  const prompt = useEngineStore((s) => s.prompt);
  const pick = useEngineStore((s) => s.pick);
  const mySeat = useNetStore((s) => s.mySeat);
  const online = useNetStore((s) => s.mode) === 'online';
  const sending = useNetStore((s) => s.sending);
  const replay = useNetStore((s) => s.replayActive);
  useEngineStore((s) => s.version); // 再描画トリガ（値は使わないが購読）
  if (!engine) return null;
  if (replay) return null; // リプレイ中の操作UIは ReplayBar が担当
  const G = engine.G;

  // 勝敗確定：もう一度プレイ（オンライン時のリマッチ/退室は EndScreen/OnlineLobby 側が担当）
  if (G.winner) {
    if (online) return null;
    return (
      <div className="controls">
        <button
          className="phasebtn go"
          onClick={() => { engine.backToSelect(); useEngineStore.getState().bump(); navigate('/battle'); }}
        >
          もう一度プレイ
        </button>
      </div>
    );
  }

  // 自分のメイン（操作可能・モーダル/選択待ちでない）
  if (G.active === mySeat && G.myActable && !G.busy && !prompt && !pick && !(online && sending)) {
    // アタック対象選択中：ヒントバー＋取消
    if (G.attackSel) {
      let tgts = 0;
      try {
        tgts = engine.legalTargets(mySeat, G.attackSel.attacker).length;
      } catch {
        tgts = 0;
      }
      return (
        <div className="controls">
          <div className="hintbar atk">
            <span className="hb-lead" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon.swords size={13} />攻撃対象を選択</span>
            <span className="hb-chip warn">
              対象 <b>{tgts}</b>
            </span>
            <span className="hb-tip">光る相手カードを選択／攻撃キャラをもう一度押すと取消</span>
          <span className="hb-tip-s">光る相手をタップ／再タップで取消</span>
          </div>
          <button className="phasebtn ghost" onClick={() => { if (online) void uiDispatch({ t: 'cancelAtk' }); else engine.cancelAttackSel(); }}>
            取消
          </button>
        </div>
      );
    }

    // 通常のメイン：ヒントバーは表示せず、ターン終了ボタンのみ。
    // 誤タップ救済: 即終了せず毎回確認する（未使用ドン/攻撃可能キャラが残っていれば警告を添える）。
    // engine.confirmUse は adapter の showPrompt を使うためエンジン非改変で確認ゲートを挟める。
    const confirmEndTurn = async () => {
      if (G.busy || G.active !== mySeat || !G.myActable || G.promptState || G.pendingChoice) return;
      const warns: string[] = [];
      try {
        const don = G.players[mySeat].don?.active || 0;
        if (don > 0) warns.push(`アクティブなドン!!が <b>${don}枚</b> 残っています`);
      } catch { /* ignore */ }
      try {
        const P = G.players[mySeat];
        let atk = 0;
        for (const c of [P.leader, ...P.chars]) {
          if (c && engine.canCardAttack(c) && engine.legalTargets(mySeat, c).length > 0) atk++;
        }
        if (atk > 0) warns.push(`アタック可能なカードが <b>${atk}枚</b> あります`);
      } catch { /* ignore */ }
      const text =
        (warns.length ? '<span class="pp-warn">⚠ ' + warns.join('<br>⚠ ') + '</span>' : '') +
        '相手のターンに移ります。';
      // この確認はローカル専用（オンラインでも相手へ中継しない）
      const ok = await engine.confirmUse(mySeat, 'ターンを終了しますか？', text, 'ターンを終了する', 'まだ続ける', { local: true });
      if (!ok) return;
      if (online) void uiDispatch({ t: 'endTurn' });
      else engine.uiEndTurn(mySeat);
    };
    // 「このターンはキャラを登場できない」等の全体制限は、手札が丸ごとグレーになるだけで理由が見えない
    // （例: OP14-020ミホークLの起動メイン）。制限中だけヒントバーで理由を常時表示する。
    const banMsg = ((): string | null => {
      try {
        const P = G.players[mySeat];
        if (P._noPlayTurn === G.turnSeq) return 'このターンは手札からカードをプレイできません';
        if (P._noSummonTurn === G.turnSeq) return 'このターンはキャラを登場できません';
        if (P._noSummonMinCostTurn === G.turnSeq) return `このターンは元々のコスト${P._noSummonMinCost}以上のキャラを登場できません`;
      } catch { /* ignore */ }
      return null;
    })();
    return (
      <div className="controls">
        {banMsg && (
          <div className="hintbar">
            <span className="hb-chip warn">⚠ {banMsg}</span>
          </div>
        )}
        <button className="phasebtn go" onClick={() => { void confirmEndTurn(); }}>
          ターン終了
        </button>
      </div>
    );
  }

  // それ以外：CPU思考中/処理中 or あなたの応答待ち（ブロック/カウンター等の入力待ち）
  // オンラインでは相手席のプロンプト＝「相手の選択待ち」なので waitingForYou から除外する。
  const mineDeciding = (x: { side?: 'me' | 'cpu'; local?: boolean } | null) => !!x && (!!(x as any).local || ((x.side || 'me') === mySeat));
  const waitingForYou = mineDeciding(prompt) || mineDeciding(pick as any);
  const oppText = online ? '相手の操作待ち' : 'CPU 思考中';
  return (
    <div className="controls">
      <span className="thinking">
        <span>{waitingForYou ? 'あなたの操作待ち' : G.active !== mySeat ? oppText : online && sending ? '同期中' : '処理中'}</span>
        <span className="dots">
          <span>●</span>
          <span>●</span>
          <span>●</span>
        </span>
      </span>
    </div>
  );
}

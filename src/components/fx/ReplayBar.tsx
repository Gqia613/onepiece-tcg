// リプレイ再生の操作バー（アイコン中心のコンパクト表示）。
// ★不変条件: リプレイは /battle/play 上でのみ生きる。他の画面へ移ったら自動で停止・後片付けする
//   （終了＝navigate だけでよく、「盤面破棄→ルートガードのリダイレクト」レースが構造的に起きない）。
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useReplayStore, replayTogglePause, replaySetSpeed, replaySkipToEnd, replayRestart, stopReplay } from '../../net/replay';
import { Icon } from '../ui/Icon';

export function ReplayBar() {
  const navigate = useNavigate();
  const loc = useLocation();
  const st = useReplayStore();
  const onPlay = loc.pathname === '/battle/play';

  // リプレイ中に盤面以外へ移動したら自動クリーンアップ（メニューからの離脱・戻るボタン等も全て吸収）。
  // seenPlay: startReplay直後の「まだ/battle/play遷移前」のコミットで誤停止しないよう、一度盤面に乗ってから有効化
  const seenPlay = useRef(false);
  useEffect(() => {
    if (!st.active) { seenPlay.current = false; return; }
    if (onPlay) { seenPlay.current = true; return; }
    if (seenPlay.current) stopReplay();
  }, [st.active, onPlay]);

  if (!st.active || !onPlay) return null;

  const btn: React.CSSProperties = {
    minWidth: 30, height: 30, padding: '0 5px', borderRadius: 8, border: '1px solid var(--gold-dim)',
    background: 'rgba(10,22,34,0.92)', color: 'var(--ink)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
  };
  const speedBtn = (s: 1 | 2 | 4) => (
    <button
      key={s}
      title={`再生速度 ${s}倍`}
      aria-label={`再生速度 ${s}倍`}
      style={{ ...btn, minWidth: 26, fontSize: 11, color: st.speed === s ? 'var(--gold-soft)' : 'var(--muted)', borderColor: st.speed === s ? 'var(--gold-soft)' : 'var(--line)' }}
      onClick={() => replaySetSpeed(s)}
    >
      {s}×
    </button>
  );

  return (
    <div style={{
      position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 210, // .endscreen(200)より前＝終局後も操作できる
      display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', borderRadius: 12,
      maxWidth: 'calc(100vw - 8px)', flexWrap: 'nowrap', // ★常に一列（狭い画面でも改行しない）
      background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))',
      border: '1px solid var(--gold-dim)', boxShadow: '0 10px 28px #000a',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: 'var(--gold-soft)', whiteSpace: 'nowrap' }}>
        <Icon.play size={12} />
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', fontWeight: 700 }}>{st.idx}/{st.total}</span>
      </span>
      {!st.done ? (
        <>
          <button style={btn} title={st.paused ? '再生' : '一時停止'} aria-label={st.paused ? '再生' : '一時停止'} onClick={replayTogglePause}>
            {st.paused ? <Icon.play size={15} /> : <Icon.pause size={15} />}
          </button>
          {[1, 2, 4].map((s) => speedBtn(s as 1 | 2 | 4))}
          <button style={btn} title="結末までスキップ" aria-label="結末までスキップ" onClick={replaySkipToEnd}>
            <Icon.skipForward size={15} />
          </button>
        </>
      ) : (
        <button style={btn} title="もう一度最初から見る" aria-label="もう一度最初から見る" onClick={replayRestart}>
          <Icon.rotateCcw size={15} />
        </button>
      )}
      <button
        style={{ ...btn, borderColor: 'var(--danger-glow,#ff6a4d)', color: 'var(--danger-glow,#ff6a4d)' }}
        title="リプレイを終了"
        aria-label="リプレイを終了"
        onClick={() => navigate('/online')} // 遷移するだけ。停止と後片付けは上のuseEffectが担う
      >
        <Icon.x size={15} />
      </button>
    </div>
  );
}

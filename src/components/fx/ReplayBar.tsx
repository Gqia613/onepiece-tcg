// リプレイ再生の操作バー（再生/一時停止・速度・結末へ・終了）。
import { useNavigate } from 'react-router-dom';
import { useReplayStore, replayTogglePause, replaySetSpeed, replaySkipToEnd, stopReplay } from '../../net/replay';

export function ReplayBar() {
  const navigate = useNavigate();
  const st = useReplayStore();
  if (!st.active) return null;

  const btn: React.CSSProperties = {
    padding: '5px 11px', borderRadius: 8, border: '1px solid var(--gold-dim)',
    background: 'rgba(10,22,34,0.92)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  };
  const speedBtn = (s: 1 | 2 | 4) => (
    <button
      key={s}
      style={{ ...btn, color: st.speed === s ? 'var(--gold-soft)' : 'var(--muted)', borderColor: st.speed === s ? 'var(--gold-soft)' : 'var(--line)' }}
      onClick={() => replaySetSpeed(s)}
    >
      {s}×
    </button>
  );

  return (
    <div style={{
      position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 210, // .endscreen(200)より前＝終局後も操作できる
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 12,
      background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))',
      border: '1px solid var(--gold-dim)', boxShadow: '0 10px 28px #000a',
    }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold-soft)' }}>▶ リプレイ</span>
      <span style={{ fontSize: 11.5, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{st.idx}/{st.total}</span>
      {!st.done ? (
        <>
          <button style={btn} onClick={replayTogglePause}>{st.paused ? '再生' : '一時停止'}</button>
          {[1, 2, 4].map((s) => speedBtn(s as 1 | 2 | 4))}
          <button style={btn} onClick={replaySkipToEnd}>結末へ</button>
        </>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>再生終了</span>
      )}
      <button style={{ ...btn, borderColor: 'var(--danger-glow,#ff6a4d)', color: 'var(--danger-glow,#ff6a4d)' }}
        onClick={() => { navigate('/online'); stopReplay(); }} // ★先に遷移（盤面消滅→ルートガードのリダイレクトに負けない）
      >
        終了する
      </button>
    </div>
  );
}

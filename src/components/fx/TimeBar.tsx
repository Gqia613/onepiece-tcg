// 持ち時間の表示（オンライン対戦・部屋設定でクロック有効時のみ）。
// 時計の計算は src/net/clock.ts（サーバtsが正）。ここは表示だけ。
import { useClockStore, fmtClock } from '../../net/clock';
import { useNetStore } from '../../state/netStore';

export function TimeBar() {
  const clk = useClockStore();
  const mySeat = useNetStore((s) => s.mySeat);
  const online = useNetStore((s) => s.mode) === 'online';
  const phase = useNetStore((s) => s.phase);
  const names = useNetStore((s) => s.names);
  if (!online || !clk.enabled || (phase !== 'playing' && phase !== 'ended')) return null;

  const chip = (label: string, ms: number, active: boolean) => {
    const warn = ms <= 60_000;
    const crit = ms <= 15_000;
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999,
          fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          border: '1px solid ' + (crit ? 'var(--danger-glow,#ff6a4d)' : active ? 'var(--gold-dim)' : 'var(--line)'),
          color: crit ? 'var(--danger-glow,#ff6a4d)' : warn ? 'var(--gold-soft)' : active ? 'var(--ink)' : 'var(--muted)',
          background: 'rgba(10,22,34,0.9)',
          boxShadow: active ? '0 0 8px rgba(255,200,87,.25)' : 'none',
        }}
      >
        <span style={{ opacity: 0.8 }}>{label}</span>
        <b>{fmtClock(ms)}</b>
      </span>
    );
  };

  const oppSeat = mySeat === 'me' ? 'cpu' : 'me';
  return (
    <div style={{ position: 'fixed', top: 56, left: 8, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'none' }}>
      {clk.mode === 'official30' && clk.shared != null ? (
        chip('対戦残り', clk.shared, true)
      ) : clk.remain ? (
        <>
          {chip((names?.[oppSeat] || '相手'), clk.remain[oppSeat], clk.owner === oppSeat)}
          {chip('あなた', clk.remain[mySeat], clk.owner === mySeat)}
          {clk.turnRemain != null && clk.owner === mySeat ? chip('この手', clk.turnRemain, true) : null}
        </>
      ) : null}
    </div>
  );
}

// オンライン対戦のネットワーク状態オーバーレイ。
// - desync: 自動復旧中はスピナー、復旧失敗（続行不可）は全画面モーダル＝退室のみ
// - reconnecting: 対戦中の再接続バナー（操作は継続可・入力はecho待ちで自然に止まる）
// - 相手切断: バナー＋猶予(90秒)経過後は「勝利して退室」ボタン（DOが猶予を再検証して裁定）
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNetStore } from '../../state/netStore';
import { leaveOnline, claimDisconnectWin } from '../../net/onlineGame';

const CLAIM_GRACE_MS = 90 * 1000; // realtime/src/room.ts と揃える

export function NetOverlay() {
  const navigate = useNavigate();
  const mode = useNetStore((s) => s.mode);
  const phase = useNetStore((s) => s.phase);
  const conn = useNetStore((s) => s.conn);
  const desync = useNetStore((s) => s.desync);
  const recovering = useNetStore((s) => s.recovering);
  const players = useNetStore((s) => s.players);
  const oppLostAt = useNetStore((s) => s.oppLostAt);
  const [, forceTick] = useState(0);

  // 勝利宣言ボタンの残り秒表示用に1秒ティック（相手切断中のみ）
  useEffect(() => {
    if (mode !== 'online' || oppLostAt == null) return;
    const t = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [mode, oppLostAt]);

  if (mode !== 'online') return null;

  const oppDown = phase === 'playing' && players.length >= 2 && players.some((p) => !p.connected);
  const waitedMs = oppLostAt != null ? Date.now() - oppLostAt : 0;
  const claimable = oppDown && oppLostAt != null && waitedMs >= CLAIM_GRACE_MS;
  const remainSec = oppLostAt != null ? Math.max(0, Math.ceil((CLAIM_GRACE_MS - waitedMs) / 1000)) : 0;

  return (
    <>
      {/* desync（復旧失敗＝続行不可） */}
      <AnimatePresence>
        {desync && !recovering ? (
          <motion.div
            key="desync"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 96, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(4, 10, 18, 0.82)', backdropFilter: 'blur(3px)',
            }}
          >
            <div style={{
              maxWidth: 420, margin: 16, padding: '22px 20px', borderRadius: 12, textAlign: 'center',
              background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))',
              border: '1px solid var(--danger-glow, #ff6a4d)', boxShadow: '0 18px 50px #000c',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>⚠ 同期エラー</div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 14 }}>
                自動復旧を試みましたが、盤面を一致させられませんでした。<br />
                お手数ですが退室して新しい部屋で対戦し直してください。
              </div>
              <button className="phasebtn go" onClick={() => { leaveOnline(); navigate('/online'); }}>退室する</button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* desync 自動復旧中 */}
      <AnimatePresence>
        {recovering ? (
          <motion.div
            key="recovering"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 96, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(4, 10, 18, 0.7)', backdropFilter: 'blur(2px)',
            }}
          >
            <div style={{
              padding: '18px 22px', borderRadius: 12, textAlign: 'center',
              background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))',
              border: '1px solid var(--gold-dim)', boxShadow: '0 18px 50px #000c',
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>⟳ 同期のずれを自動復旧中…</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>サーバの記録から盤面を再構築しています（数秒）</div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* サーバ再接続中 */}
      <AnimatePresence>
        {!desync && !recovering && conn === 'reconnecting' ? (
          <motion.div
            key="reconnect"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 95,
              padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
              background: 'rgba(20, 34, 50, 0.95)', border: '1px solid var(--gold-dim)', color: 'var(--gold-soft)',
            }}
          >
            ⟳ サーバへ再接続中…
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* 相手切断（猶予経過で勝利宣言可能） */}
      <AnimatePresence>
        {!desync && !recovering && conn === 'ok' && oppDown ? (
          <motion.div
            key="oppdown"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 95,
              padding: '8px 14px', borderRadius: 12, fontSize: 12.5, fontWeight: 700,
              background: 'rgba(20, 34, 50, 0.95)', border: '1px solid var(--line)', color: 'var(--muted)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <span>相手の接続が切れています{claimable ? '' : `（勝利宣言まで ${remainSec}秒）`}</span>
            {claimable ? (
              <button className="phasebtn go" style={{ padding: '4px 12px', fontSize: 12.5 }} onClick={() => claimDisconnectWin()}>
                勝利して終了する
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

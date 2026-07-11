// オンライン対戦のネットワーク状態オーバーレイ。
// - desync: 同期エラー（続行不可）の全画面モーダル＝退室のみ
// - reconnecting: 対戦中の再接続バナー（操作は継続可・入力はecho待ちで自然に止まる）
// - 相手切断: 小バナー（再接続を待つ。TTLはDO側が管理）
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNetStore } from '../../state/netStore';
import { leaveOnline } from '../../net/onlineGame';

export function NetOverlay() {
  const navigate = useNavigate();
  const mode = useNetStore((s) => s.mode);
  const phase = useNetStore((s) => s.phase);
  const conn = useNetStore((s) => s.conn);
  const desync = useNetStore((s) => s.desync);
  const players = useNetStore((s) => s.players);
  if (mode !== 'online') return null;

  const oppDown = phase === 'playing' && players.length >= 2 && players.some((p) => !p.connected);

  return (
    <>
      <AnimatePresence>
        {desync ? (
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
                両プレイヤーの盤面が一致しなくなったため、この対戦は続行できません。<br />
                お手数ですが退室して新しい部屋で対戦し直してください。
              </div>
              <button className="phasebtn go" onClick={() => { leaveOnline(); navigate('/online'); }}>退室する</button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {!desync && conn === 'reconnecting' ? (
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

      <AnimatePresence>
        {!desync && conn === 'ok' && oppDown ? (
          <motion.div
            key="oppdown"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 95,
              padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700,
              background: 'rgba(20, 34, 50, 0.95)', border: '1px solid var(--line)', color: 'var(--muted)',
            }}
          >
            相手の接続が切れています — 復帰を待っています…
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

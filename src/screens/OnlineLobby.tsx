// オンライン対戦ロビー。部屋を作る（コード発行）/ コードで参加 → デッキ選択 + 準備完了 → 対戦開始。
// 両者が ready になると realtime(DO) が seed を配って start → netStore.phase='playing' → 盤面へ遷移。
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import { hostRoom, joinRoom, sendReady, leaveOnline } from '../net/onlineGame';
import { seatOf, type DeckPayload } from '../net/protocol';
import { IMG } from '../engine/img';
import { Icon } from '../components/ui/Icon';

const panel: React.CSSProperties = {
  background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))',
  border: '1px solid var(--gold-dim)', borderRadius: 12, padding: 16,
  display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520, width: '100%',
};

export default function OnlineLobby() {
  const navigate = useNavigate();
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version);
  const mode = useNetStore((s) => s.mode);
  const phase = useNetStore((s) => s.phase);
  const roomCode = useNetStore((s) => s.roomCode);
  const players = useNetStore((s) => s.players);
  const conn = useNetStore((s) => s.conn);
  const mySeat = useNetStore((s) => s.mySeat);

  const [joinCode, setJoinCode] = useState('');
  const [deckId, setDeckId] = useState('');
  const [busy, setBusy] = useState(false);
  const [readySent, setReadySent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 対戦が始まったら盤面へ
  useEffect(() => {
    if (mode === 'online' && phase === 'playing') navigate('/battle/play');
  }, [mode, phase, navigate]);

  // 選べるデッキ（マイデッキ＋プリセット）。ready 送信時に {leader,list,name} へ正規化。
  const decks = useMemo(() => {
    const custom = ((engine?.G?.customDecks || []) as any[]).filter((d) => d.id !== 'net-host' && d.id !== 'net-guest');
    const presets = ((engine?.DECKS || []) as any[]);
    return { custom, presets };
  }, [engine, phase, mode]);

  if (!engine) return null;

  const findDeck = (id: string): any =>
    decks.custom.find((d) => d.id === id) || decks.presets.find((d) => d.id === id) || null;
  const selected = deckId ? findDeck(deckId) : null;

  const doHost = async () => {
    setErr(null); setBusy(true);
    try { await hostRoom(); setReadySent(false); }
    catch (e: any) { setErr(e?.message === 'realtime_unconfigured' ? 'オンライン対戦は現在利用できません（サーバ未設定）' : '部屋の作成に失敗しました'); }
    finally { setBusy(false); }
  };
  const doJoin = async () => {
    if (!joinCode.trim()) return;
    setErr(null); setBusy(true);
    try { await joinRoom(joinCode); setReadySent(false); }
    catch (e: any) { setErr(e?.message === 'realtime_unconfigured' ? 'オンライン対戦は現在利用できません（サーバ未設定）' : '入室に失敗しました'); }
    finally { setBusy(false); }
  };
  const doReady = () => {
    const d = selected;
    if (!d || !d.leader || !d.list) return;
    const payload: DeckPayload = { leader: d.leader, list: d.list, name: d.name || 'デッキ' };
    sendReady(payload);
    setReadySent(true);
  };
  const doLeave = () => {
    leaveOnline();
    setReadySent(false);
    setDeckId('');
    navigate('/');
  };
  const copyCode = async () => {
    if (!roomCode) return;
    try { await navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  const inLobby = mode === 'online' && (phase === 'lobby');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '22px 14px' }}>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon.swords size={20} />オンライン対戦
      </h2>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        部屋コードを共有して、フレンドと1対1で対戦できます
      </div>
      {err ? <div style={{ color: 'var(--danger-glow)', fontSize: 13 }}>{err}</div> : null}

      {!inLobby ? (
        <>
          <div style={panel}>
            <b>部屋を作る</b>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>6桁のコードが発行されます。相手に伝えて入室してもらいましょう。</div>
            <button className="phasebtn go" disabled={busy} onClick={() => { void doHost(); }}>部屋を作る</button>
          </div>
          <div style={panel}>
            <b>コードで参加</b>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="例: ABC234"
                maxLength={8}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--gold-dim)',
                  background: 'var(--ocean-850)', color: 'var(--ink)', fontSize: 18, letterSpacing: 3, textTransform: 'uppercase',
                }}
              />
              <button className="phasebtn go" disabled={busy || joinCode.trim().length < 4} onClick={() => { void doJoin(); }}>参加</button>
            </div>
          </div>
        </>
      ) : (
        <div style={panel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <b>部屋コード</b>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: 6, color: 'var(--gold-soft)' }}>{roomCode}</span>
            <button className="phasebtn ghost" style={{ padding: '4px 10px' }} onClick={() => { void copyCode(); }}>
              {copied ? 'コピーしました' : 'コピー'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {conn === 'ok' ? 'サーバ接続中' : conn === 'reconnecting' ? '再接続中…' : '接続中…'}／あなたは{mySeat === 'me' ? 'ホスト' : 'ゲスト'}
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {players.map((p) => (
              <div key={p.seat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <span style={{ opacity: p.connected ? 1 : 0.45 }}>
                  {p.seat === 'host' ? '👑' : '⚔'} {p.name}{seatOf(p.seat) === mySeat ? '（あなた）' : ''}
                </span>
                <span style={{ fontSize: 12, color: p.ready ? 'var(--good, #48c98a)' : 'var(--muted)' }}>
                  {p.ready ? '✔ 準備完了' : p.connected ? 'デッキ選択中…' : '切断中'}
                </span>
              </div>
            ))}
            {players.length < 2 ? (
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>相手の入室を待っています…（コードを伝えてください）</div>
            ) : null}
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b style={{ fontSize: 13.5 }}>使用するデッキ</b>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {selected ? (
                <img src={IMG(selected.leader)} referrerPolicy="no-referrer" alt="" style={{ width: 46, borderRadius: 4 }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : null}
              <select
                value={deckId}
                disabled={readySent}
                onChange={(e) => setDeckId(e.target.value)}
                style={{ flex: 1, background: 'var(--ocean-850)', color: 'var(--ink)', border: '1px solid var(--gold-dim)', borderRadius: 8, padding: '9px 10px', fontSize: 14 }}
              >
                <option value="">デッキを選択…</option>
                {decks.custom.length ? (
                  <optgroup label="マイデッキ">
                    {decks.custom.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </optgroup>
                ) : null}
                <optgroup label="プリセット">
                  {decks.presets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </optgroup>
              </select>
            </div>
            {!readySent ? (
              <button className="phasebtn go" disabled={!selected} onClick={doReady}>
                このデッキで準備完了
              </button>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--good, #48c98a)' }}>✔ 準備完了 — 相手を待っています…</div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <button className="phasebtn ghost" onClick={doLeave}>退室する</button>
          </div>
        </div>
      )}
    </div>
  );
}

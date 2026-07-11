// オンライン対戦ロビー。部屋を作る（コード発行）/ コードで参加 → 部屋設定（ホスト）→
// デッキ選択 + 準備完了 → 対戦開始。下部に戦績（リプレイ再生つき）。
// 招待リンク（/online?room=CODE）で直接入室できる。
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import { hostRoom, joinRoom, sendReady, sendConfig, leaveOnline } from '../net/onlineGame';
import { startReplay } from '../net/replay';
import { seatOf, type DeckPayload, type RoomConfig } from '../net/protocol';
import { IMG } from '../engine/img';
import { Icon } from '../components/ui/Icon';
import { DeckCarousel } from '../components/deck/DeckCarousel';

const panel: React.CSSProperties = {
  background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))',
  border: '1px solid var(--gold-dim)', borderRadius: 12, padding: 16,
  display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520, width: '100%',
};
const selStyle: React.CSSProperties = {
  background: 'var(--ocean-850)', color: 'var(--ink)', border: '1px solid var(--gold-dim)',
  borderRadius: 8, padding: '7px 9px', fontSize: 13,
};

const CLOCK_LABEL: Record<string, string> = {
  none: '時間制限なし',
  official30: '公式風: 対戦全体30分（時間切れは両者敗北）',
  per: '持ち時間制: 各プレイヤーの残り時間を消費（切れ負け）',
  perTurn: 'スピード: 持ち時間 + 1手の制限時間（切れ負け）',
};
const FIRST_LABEL: Record<string, string> = {
  random: 'ランダム', host: 'ホスト先攻', guest: 'ゲスト先攻', alt: '交互（リマッチで入替）',
};

interface MatchRow {
  id: number; code: string; game_no: number;
  host_uid: number; guest_uid: number; host_name: string; guest_name: string;
  host_leader: string; guest_leader: string; winner: 'host' | 'guest' | 'draw';
  reason: string | null; turns: number | null; created_at: string;
}

function configSummary(c: RoomConfig): string {
  const parts: string[] = [];
  if (c.clock.mode === 'none') parts.push('時間制限なし');
  else if (c.clock.mode === 'official30') parts.push('全体30分');
  else if (c.clock.mode === 'per') parts.push(`各${c.clock.perMin ?? 30}分`);
  else parts.push(`各${c.clock.perMin ?? 30}分＋1手${c.clock.turnSec ?? 90}秒`);
  parts.push('先攻: ' + FIRST_LABEL[c.firstTurn]);
  return parts.join(' ／ ');
}

export default function OnlineLobby() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version);
  const mode = useNetStore((s) => s.mode);
  const phase = useNetStore((s) => s.phase);
  const roomCode = useNetStore((s) => s.roomCode);
  const players = useNetStore((s) => s.players);
  const conn = useNetStore((s) => s.conn);
  const mySeat = useNetStore((s) => s.mySeat);
  const config = useNetStore((s) => s.config);
  const verMismatch = useNetStore((s) => s.verMismatch);

  const [joinCode, setJoinCode] = useState('');
  const [deckId, setDeckId] = useState('');
  const [busy, setBusy] = useState(false);
  const [readySent, setReadySent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [history, setHistory] = useState<MatchRow[] | null>(null);
  const [myUid, setMyUid] = useState<number | null>(null);
  const [replayLoading, setReplayLoading] = useState<number | null>(null);

  // 対戦が始まったら盤面へ
  useEffect(() => {
    if (mode === 'online' && phase === 'playing') navigate('/battle/play');
  }, [mode, phase, navigate]);

  // 招待リンク（/online?room=CODE）からの自動入室
  useEffect(() => {
    const room = (params.get('room') || '').trim().toUpperCase();
    if (!room || mode === 'online') return;
    setJoinCode(room);
    setErr(null); setBusy(true);
    joinRoom(room).catch(() => setErr('入室に失敗しました')).finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 戦績の取得（入場時と対戦終了で更新）
  useEffect(() => {
    let alive = true;
    fetch('/api/me', { credentials: 'same-origin' })
      .then((r) => r.json()).then((j) => { if (alive && j?.user?.id) setMyUid(j.user.id); }).catch(() => {});
    fetch('/api/match/history', { credentials: 'same-origin' })
      .then((r) => r.json()).then((j) => { if (alive) setHistory(j.matches || []); }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [phase]);

  const decks = useMemo(() => {
    const custom = ((engine?.G?.customDecks || []) as any[]).filter((d) => d.id !== 'net-host' && d.id !== 'net-guest');
    const presets = ((engine?.DECKS || []) as any[]);
    return { custom, presets };
  }, [engine, phase, mode]);

  if (!engine) return null;

  const findDeck = (id: string): any =>
    decks.custom.find((d) => d.id === id) || decks.presets.find((d) => d.id === id) || null;
  const selected = deckId ? findDeck(deckId) : null;
  const isHost = mySeat === 'me';

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
  const copy = async (kind: 'code' | 'link') => {
    if (!roomCode) return;
    const text = kind === 'code' ? roomCode : `${location.origin}/online?room=${roomCode}`;
    try { await navigator.clipboard.writeText(text); setCopied(kind); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  };
  const updateConfig = (patch: Partial<RoomConfig> | { clock: Partial<RoomConfig['clock']> }) => {
    const next: RoomConfig = {
      clock: { ...config.clock, ...((patch as any).clock || {}) },
      firstTurn: (patch as any).firstTurn ?? config.firstTurn,
    };
    useNetStore.getState().setConfig(next); // 楽観反映（DOがサニタイズして再配布）
    sendConfig(next);
  };
  const playReplay = async (row: MatchRow) => {
    setReplayLoading(row.id);
    try {
      const r = await fetch('/api/match/replay?id=' + row.id, { credentials: 'same-origin' });
      if (!r.ok) { setErr('リプレイを取得できませんでした'); return; }
      const j = await r.json();
      if (!j?.replay?.inputs) { setErr('この対戦のリプレイは保存されていません'); return; }
      startReplay(j.replay, j.viewerSeat === 'guest' ? 'guest' : 'host');
      navigate('/battle/play');
    } catch { setErr('リプレイを取得できませんでした'); }
    finally { setReplayLoading(null); }
  };

  const inLobby = mode === 'online' && (phase === 'lobby');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '22px 14px' }}>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon.globe size={20} />オンライン対戦
      </h2>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        部屋コードを共有して、フレンドと1対1で対戦できます
      </div>
      {err ? <div style={{ color: 'var(--danger-glow)', fontSize: 13 }}>{err}</div> : null}
      {verMismatch ? (
        <div style={{ ...panel, borderColor: 'var(--danger-glow,#ff6a4d)', maxWidth: 520 }}>
          <b style={{ color: 'var(--danger-glow,#ff6a4d)' }}>⚠ アプリの版が相手と異なります</b>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            オンライン対戦は両者が同じ版である必要があります。両方の端末でページを再読み込みしてから、もう一度「準備完了」を押してください。
          </div>
          <button className="phasebtn go" onClick={() => location.reload()}>再読み込みする</button>
        </div>
      ) : null}

      {!inLobby ? (
        <>
          <div style={panel}>
            <b>部屋を作る</b>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>6桁のコードが発行されます。コードか招待リンクを相手に伝えて入室してもらいましょう。</div>
            <button className="phasebtn go" disabled={busy} onClick={() => { void doHost(); }}>部屋を作る</button>
          </div>
          <div style={panel}>
            <b>コードで参加</b>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="例: ABC234"
                maxLength={8}
                style={{
                  flex: '1 1 auto', minWidth: 0, // ★min-width:0＝狭幅で入力欄が縮み、行がはみ出さない
                  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--gold-dim)',
                  background: 'var(--ocean-850)', color: 'var(--ink)', fontSize: 18, letterSpacing: 3, textTransform: 'uppercase',
                }}
              />
              <button className="phasebtn go" style={{ flex: '0 0 auto' }} disabled={busy || joinCode.trim().length < 4} onClick={() => { void doJoin(); }}>参加</button>
            </div>
          </div>
        </>
      ) : (
        <div style={panel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b>部屋コード</b>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: 6, color: 'var(--gold-soft)' }}>{roomCode}</span>
            <button className="phasebtn ghost" style={{ padding: '4px 10px' }} onClick={() => { void copy('code'); }}>
              {copied === 'code' ? 'コピーしました' : 'コード'}
            </button>
            <button className="phasebtn ghost" style={{ padding: '4px 10px' }} onClick={() => { void copy('link'); }}>
              {copied === 'link' ? 'コピーしました' : '招待リンク'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {conn === 'ok' ? 'サーバ接続中' : conn === 'reconnecting' ? '再接続中…' : '接続中…'}／あなたは{isHost ? 'ホスト' : 'ゲスト'}
          </div>

          {/* 部屋設定（ホストのみ変更可） */}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b style={{ fontSize: 13.5 }}>対戦設定{isHost ? '' : '（ホストが設定）'}</b>
            {isHost ? (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--muted)' }}>持ち時間</span>
                  <select style={selStyle} value={config.clock.mode} disabled={readySent}
                    onChange={(e) => updateConfig({ clock: { mode: e.target.value as any } })}>
                    {Object.entries(CLOCK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                {(config.clock.mode === 'per' || config.clock.mode === 'perTurn') ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ color: 'var(--muted)' }}>各プレイヤー</span>
                    <select style={selStyle} value={config.clock.perMin ?? 30} disabled={readySent}
                      onChange={(e) => updateConfig({ clock: { perMin: Number(e.target.value) } })}>
                      {[10, 15, 20, 25, 30, 40, 60].map((m) => <option key={m} value={m}>{m}分</option>)}
                    </select>
                  </label>
                ) : null}
                {config.clock.mode === 'perTurn' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ color: 'var(--muted)' }}>1手の制限</span>
                    <select style={selStyle} value={config.clock.turnSec ?? 90} disabled={readySent}
                      onChange={(e) => updateConfig({ clock: { turnSec: Number(e.target.value) } })}>
                      {[30, 60, 90, 120, 180].map((s) => <option key={s} value={s}>{s}秒</option>)}
                    </select>
                  </label>
                ) : null}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--muted)' }}>先攻</span>
                  <select style={selStyle} value={config.firstTurn} disabled={readySent}
                    onChange={(e) => updateConfig({ firstTurn: e.target.value as any })}>
                    {Object.entries(FIRST_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </>
            ) : (
              <div style={{ fontSize: 12.5 }}>{configSummary(config)}</div>
            )}
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
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>相手の入室を待っています…（コードか招待リンクを伝えてください）</div>
            ) : null}
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b style={{ fontSize: 13.5 }}>使用するデッキ</b>
            {readySent ? (
              // 準備完了後は選択済みデッキを小さく確認表示（カルーセルは畳む）
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {selected ? (
                  <img src={IMG(selected.leader)} referrerPolicy="no-referrer" alt="" style={{ width: 46, borderRadius: 6, border: '1px solid var(--surface-edge)' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : null}
                <span style={{ fontSize: 14, fontWeight: 700 }}>{selected?.name || 'デッキ'}</span>
              </div>
            ) : (
              // CPU対戦と同じリーダーカルーセルで選ぶ（中央のデッキ＝選択）
              <div className="deckpick-embed">
                <DeckCarousel
                  customList={decks.custom}
                  presetList={decks.presets}
                  selectedId={deckId}
                  onSelect={(d) => setDeckId(d.id)}
                />
              </div>
            )}
            {!readySent ? (
              <button className="phasebtn go" disabled={!selected} onClick={doReady}>
                このデッキで準備完了
              </button>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--good, #48c98a)' }}>✔ 準備完了 — 相手を待っています…（{configSummary(config)}）</div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <button className="phasebtn ghost" onClick={doLeave}>退室する</button>
          </div>
        </div>
      )}

      {/* 戦績（リプレイ再生） */}
      <div style={{ ...panel, gap: 6 }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon.layers size={15} />オンライン戦績</b>
        {history === null ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>読み込み中…</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>まだ対戦記録がありません（対戦が終わるとここに記録されます）</div>
        ) : (
          history.map((m) => {
            const iAmHost = myUid != null && m.host_uid === myUid;
            const oppName = iAmHost ? m.guest_name : m.host_name;
            const myLeader = iAmHost ? m.host_leader : m.guest_leader;
            const oppLeader = iAmHost ? m.guest_leader : m.host_leader;
            const outcome = m.winner === 'draw' ? 'draw' : (m.winner === 'host') === iAmHost ? 'win' : 'lose';
            const badge = outcome === 'win' ? { t: '勝ち', c: 'var(--good,#48c98a)' } : outcome === 'lose' ? { t: '負け', c: 'var(--danger-glow,#ff6a4d)' } : { t: '引分', c: 'var(--muted)' };
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: badge.c, width: 30 }}>{badge.t}</span>
                <img src={IMG(myLeader)} referrerPolicy="no-referrer" alt="" style={{ width: 26, borderRadius: 3 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>vs</span>
                <img src={IMG(oppLeader)} referrerPolicy="no-referrer" alt="" style={{ width: 26, borderRadius: 3 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {oppName}<span style={{ color: 'var(--muted)', fontSize: 11 }}>（{m.turns ? `${m.turns}T` : ''}{m.reason ? '・' + m.reason : ''}）</span>
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{(m.created_at || '').slice(5, 16).replace('T', ' ')}</span>
                <button className="phasebtn ghost" style={{ padding: '3px 10px', fontSize: 12 }} disabled={replayLoading === m.id}
                  onClick={() => { void playReplay(m); }}>
                  {replayLoading === m.id ? '…' : '▶ リプレイ'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

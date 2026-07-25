// 戦績ダッシュボード。/stats でホームから遷移。
// matches（オンライン対人戦・グループ全体）を集計して、グループ内のリーダーTier表・
// リーダー相性マトリクス・プレイヤー別成績・対戦履歴（リプレイ再生つき）を表示する。
// 集計は件数が小さい（私的グループ）前提でクライアント側で行う。
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEngineStore } from '../state/engineStore';
import { useAuth } from '../state/auth';
import { api, type StatsMatchRow } from '../api/client';
import { IMG_SM, IMG_RAW } from '../engine/img';
import { Icon } from '../components/ui/Icon';
import { startReplay } from '../net/replay';

type Rec = { w: number; l: number; d: number };
const newRec = (): Rec => ({ w: 0, l: 0, d: 0 });
const nOf = (r: Rec) => r.w + r.l + r.d;
// 勝率は引き分けを除いた決着試合ベース。決着0試合は null（表示は「—」）
const rateOf = (r: Rec): number | null => (r.w + r.l > 0 ? Math.round((r.w / (r.w + r.l)) * 100) : null);

// リーダーカードのサムネイル（weserv → 直リンク → 名前テキストの2段フォールバック）
function LThumb({ no, size = 34, name }: { no: string; size?: number; name?: string }) {
  const [stage, setStage] = useState(0);
  const src = stage === 0 ? IMG_SM(no) : stage === 1 ? IMG_RAW(no) : '';
  const w = size, h = Math.round((size * 88) / 63);
  return src ? (
    <img
      src={src} referrerPolicy="no-referrer" decoding="async" alt={name || no} title={name || no}
      style={{ width: w, height: h, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--surface-edge)', display: 'block' }}
      onError={() => setStage((s) => s + 1)}
    />
  ) : (
    <span style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', width: w, height: h,
      fontSize: 8.5, lineHeight: 1.2, overflow: 'hidden', background: 'var(--ocean-850)',
      borderRadius: 4, border: '1px solid var(--surface-edge)', color: 'var(--muted)', textAlign: 'center',
    }} title={name || no}>{name || no}</span>
  );
}

// 'YYYY-MM-DD HH:MM:SS'(UTC/SQLite) → ローカル時刻の短い表記
function fmtDate(s: string): string {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (isNaN(+d)) return s.slice(5, 16);
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TIER_BANDS = [
  { key: 'S', min: 60, color: 'var(--gold, #ffc857)' },
  { key: 'A', min: 50, color: 'var(--self-accent, #3ec9ff)' },
  { key: 'B', min: 40, color: 'var(--good, #48c98a)' },
  { key: 'C', min: -1, color: 'var(--muted, #8aa0b4)' },
];
const MIN_GAMES = 3; // Tier判定に必要な決着試合数（それ未満は「集計中」）

function cellBg(rate: number | null): string {
  if (rate == null) return 'transparent';
  if (rate >= 55) return 'rgba(72, 201, 138, .16)';
  if (rate <= 45) return 'rgba(255, 106, 77, .14)';
  return 'rgba(255, 255, 255, .03)';
}

// ---- 集計（リーダー別・相性・プレイヤー別）。純関数＝テスト対象 ----
export function aggregateMatches(rows: StatsMatchRow[]) {
  const leader: Record<string, Rec> = {};
  const cell: Record<string, Record<string, Rec>> = {};
  const player: Record<string, Rec> = {};
  const names: Record<string, string> = {};
  const pairs: Record<string, { a: string; b: string; aw: number; bw: number; d: number }> = {};
  for (const m of rows) {
    const hl = m.host_leader, gl = m.guest_leader;
    if (!hl || !gl) continue;
    const L = (no: string) => (leader[no] ||= newRec());
    const CC = (a: string, b: string) => ((cell[a] ||= {})[b] ||= newRec());
    const P = (uid: string) => (player[uid] ||= newRec());
    names[m.host_uid] ||= m.host_name;
    names[m.guest_uid] ||= m.guest_name;
    if (m.winner === 'host') {
      L(hl).w++; L(gl).l++; CC(hl, gl).w++; CC(gl, hl).l++; P(m.host_uid).w++; P(m.guest_uid).l++;
    } else if (m.winner === 'guest') {
      L(hl).l++; L(gl).w++; CC(hl, gl).l++; CC(gl, hl).w++; P(m.host_uid).l++; P(m.guest_uid).w++;
    } else {
      L(hl).d++; L(gl).d++; CC(hl, gl).d++; CC(gl, hl).d++; P(m.host_uid).d++; P(m.guest_uid).d++;
    }
    // プレイヤー直接対決（uidペア・順序を正規化）
    const [x, y] = [m.host_uid, m.guest_uid].sort();
    const p = (pairs[x + '|' + y] ||= { a: x, b: y, aw: 0, bw: 0, d: 0 });
    if (m.winner === 'draw') p.d++;
    else {
      const winUid = m.winner === 'host' ? m.host_uid : m.guest_uid;
      if (winUid === x) p.aw++; else p.bw++;
    }
  }
  // リーダーを勝率降順（決着なしは最後）→ 試合数降順で整列
  const leaders = Object.keys(leader).sort((a, b) => {
    const ra = rateOf(leader[a]), rb = rateOf(leader[b]);
    return (rb ?? -1) - (ra ?? -1) || nOf(leader[b]) - nOf(leader[a]) || a.localeCompare(b);
  });
  return { leader, cell, player, names, pairs, leaders };
}

export default function Stats() {
  const navigate = useNavigate();
  const engine = useEngineStore((s) => s.engine);
  const user = useAuth((s) => s.user);
  const [rows, setRows] = useState<StatsMatchRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [replayLoading, setReplayLoading] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    api.matchStats()
      .then(({ matches }) => { if (alive) setRows(matches || []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);

  const agg = useMemo(() => aggregateMatches(rows || []), [rows]);

  if (!engine) return null;
  const C = engine.C || {};
  const lname = (no: string) => (C[no] && C[no].name) || no;

  const total = (rows || []).length;
  const loading = rows === null;

  // Tier表: バンド分け（決着 MIN_GAMES 未満は「集計中」へ）
  const tiers: Record<string, string[]> = { S: [], A: [], B: [], C: [], pending: [] };
  for (const no of agg.leaders) {
    const r = agg.leader[no];
    const rate = rateOf(r);
    if (rate == null || r.w + r.l < MIN_GAMES) { tiers.pending.push(no); continue; }
    for (const b of TIER_BANDS) if (rate >= b.min) { tiers[b.key].push(no); break; }
  }

  // プレイヤー別（勝率降順）
  const playerList = Object.keys(agg.player).sort((a, b) => (rateOf(agg.player[b]) ?? -1) - (rateOf(agg.player[a]) ?? -1));
  const pairList = Object.values(agg.pairs);

  const history = showAll ? rows || [] : (rows || []).slice(0, 20);

  async function playReplay(m: StatsMatchRow) {
    setReplayLoading(m.id); setErr(null);
    try {
      const j = await api.matchReplay(m.id);
      if (!j?.replay?.inputs) { setErr('この対戦のリプレイは保存されていません'); return; }
      startReplay(j.replay, j.viewerSeat === 'guest' ? 'guest' : 'host');
      navigate('/battle/play');
    } catch {
      setErr('リプレイを取得できませんでした');
    } finally {
      setReplayLoading(null);
    }
  }

  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
    border: '1px solid var(--surface-edge)', background: 'var(--ocean-850)', fontSize: 12, color: 'var(--ink)',
  };

  return (
    <div className="select-wrap decks-wrap">
      <div className="bd-head" style={{ width: '100%', maxWidth: 1000 }}>
        <button className="bd-back" onClick={() => navigate('/')} aria-label="戻る" title="戻る">
          <Icon.arrowLeft size={22} />
        </button>
        <span className="bd-title">戦績</span>
        <span className="bd-note">グループ内のオンライン対戦の集計</span>
      </div>

      {err ? <div style={{ color: 'var(--danger-glow, #ff6a4d)', fontSize: 13 }}>{err}</div> : null}

      {loading ? (
        <div className="decks-empty">読み込み中…</div>
      ) : total === 0 ? (
        <div className="decks-empty">まだ対戦記録がありません。オンライン対戦をすると自動で集計されます。</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={chip}><Icon.swords size={13} />総対戦 <b>{total}</b> 戦</span>
            <span style={chip}><Icon.disc size={13} />プレイヤー <b>{playerList.length}</b> 人</span>
            <span style={chip}><Icon.layers size={13} />リーダー <b>{agg.leaders.length}</b> 種</span>
          </div>

          {/* ---- リーダーTier表 ---- */}
          <div className="sect-label">リーダーTier表（グループ内・勝率ベース）</div>
          <div style={{ width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TIER_BANDS.map((b) => (
              <div key={b.key} style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                <div style={{
                  flex: '0 0 44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 900, color: b.color, fontFamily: 'var(--font-num)',
                  background: 'var(--ocean-850)', border: '1px solid var(--surface-edge)', borderRadius: 10,
                }}>{b.key}</div>
                <div style={{
                  flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minHeight: 64,
                  padding: 8, background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))',
                  border: '1px solid var(--surface-edge)', borderRadius: 10,
                }}>
                  {tiers[b.key].length === 0 ? (
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>—</span>
                  ) : tiers[b.key].map((no) => {
                    const r = agg.leader[no];
                    return (
                      <div key={no} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 8px 4px 4px', background: 'var(--ocean-850)', border: '1px solid var(--surface-edge)', borderRadius: 8 }}>
                        <LThumb no={no} size={34} name={lname(no)} />
                        <div style={{ lineHeight: 1.25 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lname(no)}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-num)' }}>
                            <b style={{ color: b.color }}>{rateOf(r)}%</b>（{r.w}勝{r.l}敗{r.d ? `${r.d}分` : ''}）
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {tiers.pending.length > 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                集計中（決着{MIN_GAMES}戦未満）:
                {tiers.pending.map((no) => {
                  const r = agg.leader[no];
                  return <span key={no} style={{ ...chip, fontSize: 11 }}>{lname(no)} {r.w}勝{r.l}敗{r.d ? `${r.d}分` : ''}</span>;
                })}
              </div>
            ) : null}
          </div>

          {/* ---- リーダー相性表 ---- */}
          <div className="sect-label">リーダー相性表（行 → 列 への勝率）</div>
          <div style={{ width: '100%', maxWidth: 1000, overflowX: 'auto', border: '1px solid var(--surface-edge)', borderRadius: 10, background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))' }}>
            <table style={{ borderCollapse: 'collapse', margin: '0 auto', minWidth: 64 * (agg.leaders.length + 2) }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--ocean-800)', zIndex: 2, padding: 6 }} />
                  {agg.leaders.map((no) => (
                    <th key={no} style={{ padding: '8px 6px 4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}><LThumb no={no} size={30} name={lname(no)} /></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agg.leaders.map((r) => (
                  <tr key={r}>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--ocean-800)', zIndex: 1, padding: '4px 8px', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <LThumb no={r} size={26} name={lname(r)} />
                        <span style={{ fontSize: 10.5, maxWidth: 88, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{lname(r)}</span>
                      </div>
                    </th>
                    {agg.leaders.map((c) => {
                      const rec = agg.cell[r]?.[c];
                      const rate = rec ? rateOf(rec) : null;
                      return (
                        <td key={c} title={rec ? `${lname(r)} vs ${lname(c)}: ${rec.w}勝${rec.l}敗${rec.d ? rec.d + '分' : ''}` : '対戦なし'}
                          style={{
                            padding: '6px 4px', textAlign: 'center', minWidth: 58, fontFamily: 'var(--font-num)',
                            background: cellBg(rate), border: '1px solid var(--line)',
                          }}>
                          {rec ? (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 800, color: rate == null ? 'var(--muted)' : rate >= 55 ? 'var(--good, #48c98a)' : rate <= 45 ? 'var(--danger-glow, #ff6a4d)' : 'var(--ink)' }}>
                                {rate == null ? '—' : rate + '%'}
                              </div>
                              <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>{rec.w}-{rec.l}{rec.d ? `-${rec.d}` : ''}</div>
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---- プレイヤー成績（2026-07-26 ユーザー指示で非表示。戻すときは false を外す）---- */}
          {false && (<>
          <div className="sect-label">プレイヤー成績</div>
          <div style={{ width: '100%', maxWidth: 1000, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {playerList.map((uid) => {
              const r = agg.player[uid];
              const rate = rateOf(r);
              return (
                <div key={uid} style={{ flex: '1 1 200px', padding: 10, background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))', border: '1px solid var(--surface-edge)', borderRadius: 10 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon.disc size={13} />{agg.names[uid] || '?'}{user && uid === user.id ? <span style={{ fontSize: 10, color: 'var(--muted)' }}>（あなた）</span> : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, fontFamily: 'var(--font-num)' }}>
                    <b style={{ fontSize: 16, color: rate != null && rate >= 50 ? 'var(--good, #48c98a)' : 'var(--ink)' }}>{rate == null ? '—' : rate + '%'}</b>
                    　{r.w}勝 {r.l}敗{r.d ? ` ${r.d}分` : ''}（{nOf(r)}戦）
                  </div>
                </div>
              );
            })}
          </div>
          {pairList.length > 0 ? (
            <div style={{ width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pairList.map((p) => (
                <div key={p.a + p.b} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '7px 10px', background: 'var(--ocean-850)', border: '1px solid var(--surface-edge)', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, textAlign: 'right', flex: 1 }}>{agg.names[p.a] || '?'}</span>
                  <span style={{ fontFamily: 'var(--font-num)', fontWeight: 900, fontSize: 15 }}>
                    <b style={{ color: p.aw > p.bw ? 'var(--good, #48c98a)' : 'var(--ink)' }}>{p.aw}</b>
                    <span style={{ color: 'var(--muted)', margin: '0 6px' }}>-</span>
                    <b style={{ color: p.bw > p.aw ? 'var(--good, #48c98a)' : 'var(--ink)' }}>{p.bw}</b>
                  </span>
                  <span style={{ fontWeight: 700, flex: 1 }}>{agg.names[p.b] || '?'}</span>
                  {p.d ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>引分{p.d}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          </>)}

          {/* ---- 対戦履歴（リプレイ再生）---- */}
          <div className="sect-label">対戦履歴（{total}戦）</div>
          <div style={{ width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column' }}>
            {history.map((m) => {
              const winName = m.winner === 'draw' ? null : m.winner === 'host' ? m.host_name : m.guest_name;
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)', flex: '0 0 74px' }}>{fmtDate(m.created_at)}</span>
                  <LThumb no={m.host_leader} size={26} name={lname(m.host_leader)} />
                  <span style={{ fontSize: 12.5, fontWeight: m.winner === 'host' ? 800 : 400, color: m.winner === 'host' ? 'var(--gold, #ffc857)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                    {m.host_name}{m.winner === 'host' ? ' ♛' : ''}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>vs</span>
                  <LThumb no={m.guest_leader} size={26} name={lname(m.guest_leader)} />
                  <span style={{ fontSize: 12.5, fontWeight: m.winner === 'guest' ? 800 : 400, color: m.winner === 'guest' ? 'var(--gold, #ffc857)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110, flex: 1 }}>
                    {m.guest_name}{m.winner === 'guest' ? ' ♛' : ''}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}>
                    {m.winner === 'draw' ? '引分' : winName ? '' : ''}{m.turns ? `${m.turns}T` : ''}{m.reason ? `・${m.reason}` : ''}
                  </span>
                  {m.has_replay ? (
                    <button className="phasebtn ghost" style={{ padding: '3px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}
                      disabled={replayLoading === m.id} onClick={() => { void playReplay(m); }}>
                      {replayLoading === m.id ? '…' : <><Icon.play size={11} />再生</>}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {!showAll && total > history.length ? (
              <button className="decks-btn" style={{ margin: '10px auto 0' }} onClick={() => setShowAll(true)}>
                すべて表示（残り{total - history.length}戦）
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

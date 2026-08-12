// プロキシ印刷PDF生成画面。/proxy でマイデッキ/デッキ一覧から遷移。
// 「印刷リスト（カート）」方式: デッキ読み込み（追加/置き換え）と全カード検索の両方から
// リストに積み、枚数を調整して A3横(18枚/頁)/A4縦(9枚/頁)・等倍63×88mmのPDFを生成する。
// 画像は weserv 経由の公式画像（CORS可・原寸PNG）をブラウザだけで取得＝サーバ不要。
// できたPDFは別タブで開き、共有から netprint（かんたんnetprint）へ渡してセブンで等倍印刷する。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEngineStore } from '../state/engineStore';
import { api } from '../api/client';
import { sharedToDeck } from '../state/decks';
import { IMG_SM, IMG_RAW } from '../engine/img';
import { Icon } from '../components/ui/Icon';
import { ZoomView } from '../components/deck/CardZoom';
import { buildProxyPdf, computeLayout, pageCount, type ProxyPaper } from '../lib/proxyPdf';
import type { Deck } from '../engine/types';

interface Row { no: string; name: string; count: number; deckCount: number } // deckCount=読み込んだデッキでの枚数（検索追加は0）

const TYPE_ORDER: Record<string, number> = { LEADER: 0, CHAR: 1, EVENT: 2, STAGE: 3 };
const TYPE_LABEL: Array<[string, string]> = [['LEADER', 'リーダー'], ['CHAR', 'キャラ'], ['EVENT', 'イベント'], ['STAGE', 'ステージ']];
const COLOR_HEX: Record<string, string> = {
  赤: '#d2473f', 緑: '#2f9e63', 青: '#3a7fc9', 紫: '#9a57d4', 黒: '#7a8496', 黄: '#c9b03a',
};

// 弾コード（'OP13'/'ST21'/'EB02'/'P' 等）→ 並び順キー。最新弾から降順に使う。
// 系列の優先: OP（メイン弾）→ EB → PRB → ST → その他（プロモP等）。同一系列内は弾番号の降順。
const SERIES_RANK: Record<string, number> = { OP: 4, EB: 3, PRB: 2, ST: 1 };
function parseSetCode(code: string): { rank: number; num: number } {
  const m = /^([A-Z]+)(\d+)?$/.exec(code) || [];
  return { rank: SERIES_RANK[m[1] || ''] ?? 0, num: parseInt(m[2] || '0', 10) || 0 };
}
function setSortKey(no: string): { rank: number; num: number } {
  return parseSetCode(no.split('-')[0]);
}

// デッキ（{leader,list}）→ 印刷行（リーダー1枚を先頭に、種別→コスト順）
function deckRows(deck: { leader: string; list?: Record<string, number> }, C: Record<string, any>): Row[] {
  const meta = (no: string) => C[no] || C[no.replace(/_r\d+$/, '')] || { name: no, type: 'CHAR', cost: 0 };
  const rows = Object.entries(deck.list || {})
    .map(([no, count]) => ({ no, count: count as number, deckCount: count as number, name: meta(no).name, type: meta(no).type, cost: meta(no).cost || 0 }))
    .sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || a.cost - b.cost)
    .map(({ no, name, count, deckCount }) => ({ no, name, count, deckCount }));
  return [{ no: deck.leader, name: meta(deck.leader).name, count: 1, deckCount: 1 }, ...rows];
}

function sanitizeName(s: string): string {
  return (s || 'proxy').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
}

function Thumb({ no, name, size = 40 }: { no: string; name: string; size?: number }) {
  const [stage, setStage] = useState(0);
  const src = stage === 0 ? IMG_SM(no) : stage === 1 ? IMG_RAW(no) : '';
  const h = Math.round(size * 1.4);
  return src ? (
    <img src={src} referrerPolicy="no-referrer" decoding="async" loading="lazy" alt={name} title={name}
      style={{ width: size, height: h, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--surface-edge)', display: 'block' }}
      onError={() => setStage((s) => s + 1)} />
  ) : (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: h, fontSize: 8, background: 'var(--ocean-850)', borderRadius: 4, border: '1px solid var(--surface-edge)', color: 'var(--muted)', textAlign: 'center', overflow: 'hidden' }}>{name}</span>
  );
}

export default function ProxyPrint() {
  const navigate = useNavigate();
  const location = useLocation();
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version);

  const passed = (location.state as any)?.deck as { name: string; leader: string; list: Record<string, number> } | undefined;

  const [shared, setShared] = useState<Deck[]>([]);
  const [selVal, setSelVal] = useState<string>(passed ? '__passed' : '');
  const [rows, setRows] = useState<Row[]>([]);
  const [deckName, setDeckName] = useState<string>(passed?.name || '');
  const [paper, setPaper] = useState<ProxyPaper>('a3');
  const [gap, setGap] = useState<number>(0);
  const [marks, setMarks] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ size: number; pages: number; name: string; url: string; opened: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // ---- 全カード検索 ----
  const [q, setQ] = useState('');
  const [colorF, setColorF] = useState<string | null>(null);
  const [typeF, setTypeF] = useState<string | null>(null);
  const [setF, setSetF] = useState<string | null>(null); // 弾の絞り込み（収録弾ベース）
  const [zoom, setZoom] = useState<{ no: string; name: string } | null>(null); // 長押し拡大中のカード

  const urlRef = useRef<string | null>(null); // 生成済みPDFの blob URL（再生成・画面離脱で解放）
  const initedRef = useRef(false);            // 遷移元デッキの初期読み込みは1回だけ
  // 長押し検出（450ms・8px以上動いたら不成立）。成立したらタップ追加を抑止して拡大表示。
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const lpPos = useRef<{ x: number; y: number } | null>(null);
  const lpStart = (no: string, name: string, x: number, y: number) => {
    lpFired.current = false;
    lpPos.current = { x, y };
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => { lpFired.current = true; setZoom({ no, name }); }, 450);
  };
  const lpCancel = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };
  const lpMove = (x: number, y: number) => {
    const p = lpPos.current;
    if (p && (Math.abs(x - p.x) > 8 || Math.abs(y - p.y) > 8)) lpCancel(); // スクロール操作は長押しにしない
  };

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  // 共有デッキも選択肢に
  useEffect(() => {
    let alive = true;
    const eng = useEngineStore.getState().engine;
    if (!eng) return;
    api.listSharedDecks()
      .then(({ decks }) => { if (alive) setShared(decks.map((d) => sharedToDeck(eng, d))); })
      .catch(() => { /* 空のまま */ });
    return () => { alive = false; };
  }, [engine]);

  const C = engine?.C || {};
  const custom: Deck[] = ((engine?.G?.customDecks || []) as Deck[]);
  const presets: Deck[] = ((engine?.DECKS || []) as Deck[]);

  // 初期デッキ（遷移元から渡されたもの）を読み込み
  useEffect(() => {
    if (passed && engine && !initedRef.current) {
      initedRef.current = true;
      setRows(deckRows(passed, engine.C || {}));
      setDeckName(passed.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // 選択中デッキの解決（'__passed' = 遷移元デッキ）
  const selDeck: any = selVal === '__passed'
    ? passed || null
    : custom.find((x) => x.id === selVal) || shared.find((x) => x.id === selVal) || presets.find((x) => x.id === selVal) || null;

  // デッキを印刷リストへ（add=合算 / replace=置き換え）
  function addDeckToList(mode: 'add' | 'replace') {
    const d = selDeck;
    if (!d || !d.list) return;
    const newRows = deckRows(d, C);
    const wasEmpty = rows.length === 0;
    setRows((prev) => {
      if (mode === 'replace' || prev.length === 0) return newRows;
      const out = prev.map((r) => ({ ...r }));
      for (const nr of newRows) {
        const ex = out.find((r) => r.no === nr.no);
        if (ex) { ex.count = Math.min(10, ex.count + nr.count); ex.deckCount = Math.max(ex.deckCount, nr.deckCount); }
        else out.push(nr);
      }
      return out;
    });
    if (mode === 'replace' || wasEmpty) setDeckName(d.name);
    setResult(null); setErr(null);
  }

  // 検索結果からカードを1枚追加（既にあれば+1）
  function addCard(no: string, b: any) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.no === no);
      if (i >= 0) return prev.map((r, j) => (j === i ? { ...r, count: Math.min(10, r.count + 1) } : r));
      return [...prev, { no, name: b.name || no, count: 1, deckCount: 0 }];
    });
    setResult(null);
  }

  // 枚数変更。0枚になったら行そのものをリストから消す
  const setCount = (no: string, count: number) => {
    setRows((rs) => (count <= 0
      ? rs.filter((r) => r.no !== no)
      : rs.map((r) => (r.no === no ? { ...r, count: Math.min(10, count) } : r))));
    setResult(null);
  };

  // 弾の選択肢（カード番号の接頭辞 = OP16/ST21/EB02/P 等）。最新弾から降順。
  // ★収録弾(b.sets)ベースだと再録カード（例: PRB01収録のOP番号カード）が「別の弾なのに出る」ように
  //   見えて混乱するため、ユーザーの直感どおり番号接頭辞で絞る。
  const allSets = useMemo(() => {
    const s = new Set<string>();
    for (const no of Object.keys(C)) {
      if (/_r\d+$/.test(no)) continue;
      const b = C[no];
      if (!b || !b.type) continue;
      s.add(no.split('-')[0]);
    }
    return [...s].sort((a, b) => {
      const ka = parseSetCode(a), kb = parseSetCode(b);
      return kb.rank - ka.rank || kb.num - ka.num || a.localeCompare(b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // ---- 全カード検索（エンジンの C = 全カードDB をローカルフィルタ）----
  // ★パラレル(_rN=別イラストの同一カード)も C に別キーで入っているため除外（重複表示の原因）。
  //   絞り込みなし＝全カードを表示（件数上限なし・画像は loading="lazy" で遅延取得）。
  //   並びは最新弾から降順（setSortKey）。
  const searchOn = q.trim() !== '' || colorF !== null || typeF !== null || setF !== null; // クリアボタンの表示判定
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out: Array<{ no: string; b: any }> = [];
    for (const no of Object.keys(C)) {
      if (/_r\d+$/.test(no)) continue; // パラレルはノーマル版に集約
      const b = C[no];
      if (!b || !b.type) continue;
      if (typeF && b.type !== typeF) continue;
      if (colorF && !((b.color || []) as string[]).includes(colorF)) continue;
      if (setF && no.split('-')[0] !== setF) continue; // 番号接頭辞で厳密一致
      if (query && !(no.toLowerCase().includes(query) || String(b.name || '').toLowerCase().includes(query))) continue;
      out.push({ no, b });
    }
    out.sort((a, bb) => {
      const ka = setSortKey(a.no), kb = setSortKey(bb.no);
      return kb.rank - ka.rank || kb.num - ka.num || a.no.localeCompare(bb.no);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, colorF, typeF, setF, engine]);

  const countOf = (no: string) => rows.find((r) => r.no === no)?.count || 0;

  const total = useMemo(() => rows.reduce((s, r) => s + r.count, 0), [rows]);
  const kinds = useMemo(() => rows.filter((r) => r.count > 0).length, [rows]);
  const pages = total > 0 ? pageCount(total, paper, gap) : 0;
  const L = computeLayout(paper, gap);

  async function generate() {
    if (total === 0 || busy) return;
    // ★別タブで開く: 画像取得(async)の後の window.open はポップアップブロックされるため、
    //   クリックの同期文脈で先に空タブを確保し、生成完了後に blob URL へ差し替える。
    const win = typeof window.open === 'function' ? window.open('', '_blank') : null;
    try {
      if (win) {
        win.document.title = 'プロキシPDFを生成中…';
        win.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px;color:#333">プロキシPDFを生成しています…（カード画像の取得に数秒かかります）</p>';
      }
    } catch { /* 書き込めない環境は無視（PDF差し替えは可能） */ }
    setBusy(true); setErr(null); setResult(null); setProg(null);
    try {
      const name = `${sanitizeName(deckName)}_proxy_${paper.toUpperCase()}.pdf`;
      const bytes = await buildProxyPdf(
        rows.filter((r) => r.count > 0).map((r) => ({ no: r.no, count: r.count })),
        { paper, gapMm: gap, marks, title: name, onProgress: (done, totalN) => setProg({ done, total: totalN }) },
      );
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      const opened = !!(win && !win.closed);
      if (opened) win!.location.href = url;
      setResult({ size: bytes.length, pages, name, url, opened });
    } catch (e: any) {
      try { win?.close(); } catch { /* ignore */ }
      setErr(e?.message || 'PDFの生成に失敗しました');
    } finally {
      setBusy(false); setProg(null);
    }
  }

  // 手動で開き直す/保存する（result パネルのボタン。クリック直下なのでブロックされない）
  const openPdf = () => { if (result) window.open(result.url, '_blank'); };
  const downloadPdf = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url; a.download = result.name;
    document.body.appendChild(a); a.click(); a.remove();
  };

  if (!engine) return null;

  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  const selStyle: React.CSSProperties = {
    background: 'var(--ocean-850)', color: 'var(--ink)', border: '1px solid var(--surface-edge)',
    borderRadius: 8, padding: '8px 10px', fontSize: 13, maxWidth: '100%',
  };
  const optBtn = (on: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
    border: '1px solid ' + (on ? 'var(--gold, #ffc857)' : 'var(--surface-edge)'),
    background: on ? 'linear-gradient(180deg, rgba(255,200,87,.18), rgba(255,200,87,.06))' : 'var(--ocean-850)',
    color: on ? 'var(--gold-soft, #ffd98a)' : 'var(--ink)', fontWeight: on ? 800 : 500,
  });
  const chip = (on: boolean, accent?: string): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
    border: '1px solid ' + (on ? (accent || 'var(--gold, #ffc857)') : 'var(--surface-edge)'),
    background: on ? 'rgba(255,255,255,.08)' : 'var(--ocean-850)',
    color: 'var(--ink)', fontWeight: on ? 800 : 500,
    display: 'inline-flex', alignItems: 'center', gap: 5,
  });

  return (
    <div className="select-wrap decks-wrap proxy-wrap">
      <div className="bd-head" style={{ width: '100%', maxWidth: 1000 }}>
        <button className="bd-back" onClick={() => navigate(-1)} aria-label="戻る" title="戻る">
          <Icon.arrowLeft size={22} />
        </button>
        <span className="bd-title">プロキシ印刷</span>
        <span className="bd-note">スタンダード63×88mm・等倍印刷用PDF</span>
      </div>

      {/* ===== デッキから追加 ===== */}
      <div className="sect-label">デッキから追加</div>
      <div style={{ width: '100%', maxWidth: 1000, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select style={{ ...selStyle, flex: '1 1 220px', minWidth: 0 }} value={selVal} onChange={(e) => setSelVal(e.target.value)}>
          <option value="" disabled>デッキを選択…</option>
          {passed ? <option value="__passed">{passed.name}（開いていたデッキ）</option> : null}
          {custom.length ? (
            <optgroup label="マイデッキ">
              {custom.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </optgroup>
          ) : null}
          {shared.length ? (
            <optgroup label="みんなのデッキ">
              {shared.map((d) => <option key={d.id} value={d.id}>{d.name}（{(d as any).sharedBy}）</option>)}
            </optgroup>
          ) : null}
          <optgroup label="プリセット">
            {presets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </optgroup>
        </select>
        <button className="dsm-pill gold" disabled={!selDeck} onClick={() => addDeckToList('add')} title="今のリストに合算します">リストに追加</button>
        <button className="dsm-pill" disabled={!selDeck} onClick={() => addDeckToList('replace')} title="リストをこのデッキだけにします">置き換え</button>
      </div>

      {/* ===== 全カードから検索して追加 ===== */}
      <div className="sect-label">カードを検索して追加</div>
      <div style={{ width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* ★placeholder に「カード番号」を書かない: Safari の自動入力ヒューリスティックが
              決済のカード番号欄と誤判定し、数字系キーボードに切り替わって地球儀キーが消える
              （＝日本語入力に切り替えられなくなる。iOS実機で再現）。type=search / name=q /
              autocomplete=off も同じ誤判定を避けるための指定で、外すと再発しうる。 */}
          <input
            className="bd-search"
            type="search"
            name="q"
            inputMode="text"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="カード名・型番で検索（例: ルフィ / OP01-001）"
            style={{ maxWidth: 'none' }}
          />
          {searchOn ? (
            <button className="dsm-pill" onClick={() => { setQ(''); setColorF(null); setTypeF(null); setSetF(null); }}>クリア</button>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.entries(COLOR_HEX).map(([c, hex]) => (
            <button key={c} style={chip(colorF === c, hex)} onClick={() => setColorF(colorF === c ? null : c)}>
              <span className="dot" style={{ width: 9, height: 9, borderRadius: '50%', background: hex, display: 'inline-block' }} />{c}
            </button>
          ))}
          <span style={{ width: 8 }} />
          {TYPE_LABEL.map(([t, label]) => (
            <button key={t} style={chip(typeF === t)} onClick={() => setTypeF(typeF === t ? null : t)}>{label}</button>
          ))}
          <span style={{ width: 8 }} />
          <select
            style={{ ...selStyle, padding: '5px 8px', fontSize: 12, borderRadius: 999, fontWeight: setF ? 800 : 500, borderColor: setF ? 'var(--gold, #ffc857)' : 'var(--surface-edge)' }}
            value={setF ?? ''}
            onChange={(e) => setSetF(e.target.value || null)}
            title="収録弾で絞り込み"
          >
            <option value="">弾: すべて</option>
            {allSets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {results.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>該当するカードがありません</div>
        ) : (
            <>
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--surface-edge)', borderRadius: 10, padding: 10, background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: 8 }}>
                  {results.map(({ no, b }) => {
                    const cnt = countOf(no);
                    return (
                      <div
                        key={no}
                        title={`${b.name} — タップで追加・長押しで拡大`}
                        onPointerDown={(e) => lpStart(no, b.name, e.clientX, e.clientY)}
                        onPointerMove={(e) => lpMove(e.clientX, e.clientY)}
                        onPointerUp={lpCancel}
                        onPointerCancel={lpCancel}
                        onPointerLeave={lpCancel}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={() => { if (lpFired.current) { lpFired.current = false; return; } addCard(no, b); }}
                        style={{
                          cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                          userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation',
                        } as React.CSSProperties}>
                        <div style={{ position: 'relative' }}>
                          <Thumb no={no} name={b.name} size={56} />
                          {cnt > 0 ? (
                            <span style={{
                              position: 'absolute', right: -4, top: -4, zIndex: 2,
                              fontFamily: 'var(--font-num)', fontWeight: 800, fontSize: 11, lineHeight: '15px',
                              minWidth: 18, textAlign: 'center', padding: '0 4px', borderRadius: 999,
                              background: 'linear-gradient(180deg,var(--gold-soft),var(--gold))', color: '#1a1205',
                              boxShadow: '0 1px 4px #000a', border: '1px solid #0006',
                            }}>×{cnt}</span>
                          ) : null}
                        </div>
                        <span style={{ fontSize: 9.5, color: 'var(--muted)', maxWidth: 66, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                タップで追加（もう一度で+1）・長押しで拡大・全{results.length}件
              </div>
            </>
        )}
      </div>

      {/* ===== 印刷設定 ===== */}
      <div className="sect-label">印刷設定</div>
      <div style={{ width: '100%', maxWidth: 1000, display: 'flex', gap: '10px 26px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>用紙</span>
          <button style={optBtn(paper === 'a3')} onClick={() => { setPaper('a3'); setResult(null); }}>A3 横（18枚/頁）</button>
          <button style={optBtn(paper === 'a4')} onClick={() => { setPaper('a4'); setResult(null); }}>A4 縦（9枚/頁）</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>間隔</span>
          {[0, 1, 2].map((g) => (
            <button key={g} style={optBtn(gap === g)} onClick={() => { setGap(g); setResult(null); }}>{g}mm</button>
          ))}
        </div>
        <button style={{ ...optBtn(marks), flex: '0 0 auto' }} onClick={() => { setMarks(!marks); setResult(null); }}>
          {marks ? '✓ ' : ''}切り取りガイド
        </button>
      </div>

      {/* ===== 印刷リスト ===== */}
      <div className="sect-label">印刷リスト{rows.length ? `（${total}枚・${kinds}種）` : ''}</div>
      {rows.length === 0 ? (
        <div className="decks-empty">デッキを読み込むか、カードを検索して印刷リストに追加してください。</div>
      ) : (
        <>
          <div style={{ width: '100%', maxWidth: 1000, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
            合計 <b style={{ color: 'var(--ink)' }}>{total}</b> 枚（{kinds}種）→ {paper.toUpperCase()} <b style={{ color: 'var(--ink)' }}>{pages}</b> ページ（{L.cols}×{L.rows}面付け・余白 左右{L.originX.toFixed(1)}mm/上下{L.originY.toFixed(1)}mm）
          </div>

          <div style={{ width: '100%', maxWidth: 1000, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 6 }}>
            {rows.map((r) => (
              <div key={r.no} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--ocean-850)', border: '1px solid var(--surface-edge)', borderRadius: 8 }}>
                <Thumb no={r.no} name={r.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{r.no}{r.deckCount > 1 ? `・デッキ${r.deckCount}枚` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button className="dsm-pill" style={{ padding: '2px 10px' }} onClick={() => setCount(r.no, r.count - 1)}>−</button>
                  <b style={{ fontFamily: 'var(--font-num)', minWidth: 18, textAlign: 'center' }}>{r.count}</b>
                  <button className="dsm-pill" style={{ padding: '2px 10px' }} onClick={() => setCount(r.no, r.count + 1)}>＋</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
            <button className="decks-btn" onClick={() => { setRows([]); setDeckName(''); setResult(null); }}>リストを空にする</button>
            <button className="decks-btn gold" disabled={busy || total === 0} onClick={() => void generate()}>
              <Icon.printer size={14} /> {busy ? (prog ? `画像取得中… ${prog.done}/${prog.total}` : '生成中…') : 'PDFを生成（別タブで開く）'}
            </button>
          </div>
        </>
      )}

      {err ? <div style={{ color: 'var(--danger-glow, #ff6a4d)', fontSize: 13 }}>{err}</div> : null}

      {result ? (
        <div style={{ width: '100%', maxWidth: 720, padding: 12, background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))', border: '1px solid var(--surface-edge)', borderRadius: 10, fontSize: 12.5, lineHeight: 1.8 }}>
          <b style={{ color: 'var(--good, #48c98a)' }}>
            ✓ {result.name}（{mb(result.size)}MB・{result.pages}ページ）を生成しました
            {result.opened ? '（別タブで開いています）' : ''}
          </b>
          {!result.opened ? (
            <div style={{ color: 'var(--danger-glow, #ff6a4d)' }}>
              ⚠ タブを開けませんでした（ポップアップブロック）。下の「PDFを開く」を押してください。
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, margin: '6px 0', flexWrap: 'wrap' }}>
            <button className="dsm-pill gold" onClick={openPdf}>PDFを開く</button>
            <button className="dsm-pill" onClick={downloadPdf}>ダウンロード</button>
          </div>
          {result.size > 10 * 1024 * 1024 ? (
            <div style={{ color: 'var(--danger-glow, #ff6a4d)' }}>
              ⚠ netprint の上限（10MB）を超えています。枚数を分けて2回に分割してください（セブンのマルチコピーアプリなら30MBまで可）。
            </div>
          ) : null}
          <div style={{ color: 'var(--muted)' }}>
            セブンで印刷する手順:<br />
            ① 開いたPDFの共有メニューから netprint / かんたんnetprint アプリへ渡す<br />
            ② マルチコピー機でプリント番号を入力し、用紙サイズ <b style={{ color: 'var(--ink)' }}>{paper === 'a3' ? 'A3' : 'A4'}</b>・カラーを選択<br />
            ③ <b style={{ color: 'var(--ink)' }}>倍率は必ず等倍（100%）</b>にする（「用紙に合わせる」だとカードサイズがずれます）
          </div>
        </div>
      ) : null}

      {/* 長押し拡大オーバーレイ（高解像度＝効果テキストが読める。タップで閉じる） */}
      {zoom ? <ZoomView key={zoom.no} no={zoom.no} name={zoom.name} onClose={() => setZoom(null)} /> : null}
    </div>
  );
}

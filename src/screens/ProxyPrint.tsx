// プロキシ印刷PDF生成画面。/proxy でマイデッキ/デッキ一覧から遷移。
// デッキを選ぶ→枚数を調整→A3横(18枚/頁)/A4縦(9枚/頁)・等倍63×88mmのPDFをその場で生成してダウンロード。
// 画像は weserv 経由の公式画像（CORS可・原寸PNG）をブラウザだけで取得＝サーバ不要。
// できたPDFは netprint（かんたんnetprint）にアップして、セブンのマルチコピー機で等倍印刷する。
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEngineStore } from '../state/engineStore';
import { api } from '../api/client';
import { sharedToDeck } from '../state/decks';
import { IMG_SM, IMG_RAW } from '../engine/img';
import { Icon } from '../components/ui/Icon';
import { buildProxyPdf, computeLayout, pageCount, type ProxyPaper } from '../lib/proxyPdf';
import type { Deck } from '../engine/types';

interface Row { no: string; name: string; count: number; deckCount: number }

const TYPE_ORDER: Record<string, number> = { LEADER: 0, CHAR: 1, EVENT: 2, STAGE: 3 };

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
  return (s || 'deck').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
}

function Thumb({ no, name }: { no: string; name: string }) {
  const [stage, setStage] = useState(0);
  const src = stage === 0 ? IMG_SM(no) : stage === 1 ? IMG_RAW(no) : '';
  return src ? (
    <img src={src} referrerPolicy="no-referrer" decoding="async" alt={name} title={name}
      style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--surface-edge)' }}
      onError={() => setStage((s) => s + 1)} />
  ) : (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 56, fontSize: 8, background: 'var(--ocean-850)', borderRadius: 4, border: '1px solid var(--surface-edge)', color: 'var(--muted)', textAlign: 'center', overflow: 'hidden' }}>{name}</span>
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
  const [rows, setRows] = useState<Row[] | null>(null);
  const [deckName, setDeckName] = useState<string>(passed?.name || '');
  const [paper, setPaper] = useState<ProxyPaper>('a3');
  const [gap, setGap] = useState<number>(0);
  const [marks, setMarks] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ size: number; pages: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  // 初期デッキ（遷移元から渡されたもの）
  useEffect(() => {
    if (passed && engine && rows === null) {
      setRows(deckRows(passed, engine.C || {}));
      setDeckName(passed.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const pickDeck = (val: string) => {
    setSelVal(val);
    setResult(null); setErr(null);
    if (!engine) return;
    if (val === '__passed' && passed) { setRows(deckRows(passed, C)); setDeckName(passed.name); return; }
    const d = custom.find((x) => x.id === val) || shared.find((x) => x.id === val) || presets.find((x) => x.id === val);
    if (d && d.list) { setRows(deckRows(d as any, C)); setDeckName(d.name); }
  };

  const setCount = (no: string, count: number) => {
    setRows((rs) => (rs || []).map((r) => (r.no === no ? { ...r, count: Math.max(0, Math.min(10, count)) } : r)));
    setResult(null);
  };

  const total = useMemo(() => (rows || []).reduce((s, r) => s + r.count, 0), [rows]);
  const kinds = useMemo(() => (rows || []).filter((r) => r.count > 0).length, [rows]);
  const pages = total > 0 ? pageCount(total, paper, gap) : 0;
  const L = computeLayout(paper, gap);

  async function generate() {
    if (!rows || total === 0 || busy) return;
    setBusy(true); setErr(null); setResult(null); setProg(null);
    try {
      const bytes = await buildProxyPdf(
        rows.filter((r) => r.count > 0).map((r) => ({ no: r.no, count: r.count })),
        { paper, gapMm: gap, marks, onProgress: (done, totalN) => setProg({ done, total: totalN }) },
      );
      const name = `${sanitizeName(deckName)}_proxy_${paper.toUpperCase()}.pdf`;
      const blob = new Blob([bytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setResult({ size: bytes.length, pages, name });
    } catch (e: any) {
      setErr(e?.message || 'PDFの生成に失敗しました');
    } finally {
      setBusy(false); setProg(null);
    }
  }

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

  return (
    <div className="select-wrap decks-wrap">
      <div className="bd-head" style={{ width: '100%', maxWidth: 1000 }}>
        <button className="bd-back" onClick={() => navigate(-1)} aria-label="戻る" title="戻る">
          <Icon.arrowLeft size={22} />
        </button>
        <span className="bd-title">プロキシ印刷</span>
        <span className="bd-note">スタンダード63×88mm・等倍印刷用PDF</span>
      </div>

      {/* デッキ選択 */}
      <div style={{ width: '100%', maxWidth: 1000, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>デッキ:</span>
        <select style={selStyle} value={selVal} onChange={(e) => pickDeck(e.target.value)}>
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
      </div>

      {rows === null ? (
        <div className="decks-empty">デッキを選ぶと、カードごとの印刷枚数を調整できます。</div>
      ) : (
        <>
          {/* オプション */}
          <div style={{ width: '100%', maxWidth: 1000, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>用紙</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={optBtn(paper === 'a3')} onClick={() => { setPaper('a3'); setResult(null); }}>A3 横（18枚/頁）</button>
              <button style={optBtn(paper === 'a4')} onClick={() => { setPaper('a4'); setResult(null); }}>A4 縦（9枚/頁）</button>
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>間隔</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2].map((g) => (
                <button key={g} style={optBtn(gap === g)} onClick={() => { setGap(g); setResult(null); }}>{g}mm</button>
              ))}
            </div>
            <button style={optBtn(marks)} onClick={() => { setMarks(!marks); setResult(null); }}>
              {marks ? '✓ ' : ''}切り取りガイド
            </button>
          </div>

          {/* サマリ */}
          <div style={{ width: '100%', maxWidth: 1000, fontSize: 12.5, color: 'var(--muted)' }}>
            合計 <b style={{ color: 'var(--ink)' }}>{total}</b> 枚（{kinds}種）→ {paper.toUpperCase()} <b style={{ color: 'var(--ink)' }}>{pages}</b> ページ（{L.cols}×{L.rows}面付け・余白 左右{L.originX.toFixed(1)}mm/上下{L.originY.toFixed(1)}mm）
          </div>

          {/* カードごとの枚数調整 */}
          <div style={{ width: '100%', maxWidth: 1000, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 6 }}>
            {rows.map((r) => (
              <div key={r.no} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--ocean-850)', border: '1px solid var(--surface-edge)', borderRadius: 8, opacity: r.count === 0 ? 0.45 : 1 }}>
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

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="decks-btn" onClick={() => setRows((rs) => (rs || []).map((r) => ({ ...r, count: r.deckCount })))}>デッキ通りに戻す</button>
            <button className="decks-btn" onClick={() => setRows((rs) => (rs || []).map((r) => ({ ...r, count: 0 })))}>全て0にする</button>
            <button className="decks-btn gold" disabled={busy || total === 0} onClick={() => void generate()}>
              <Icon.printer size={14} /> {busy ? (prog ? `画像取得中… ${prog.done}/${prog.total}` : '生成中…') : 'PDFを生成してダウンロード'}
            </button>
          </div>

          {err ? <div style={{ color: 'var(--danger-glow, #ff6a4d)', fontSize: 13 }}>{err}</div> : null}

          {result ? (
            <div style={{ width: '100%', maxWidth: 720, padding: 12, background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))', border: '1px solid var(--surface-edge)', borderRadius: 10, fontSize: 12.5, lineHeight: 1.8 }}>
              <b style={{ color: 'var(--good, #48c98a)' }}>✓ {result.name}（{mb(result.size)}MB・{result.pages}ページ）をダウンロードしました</b>
              {result.size > 10 * 1024 * 1024 ? (
                <div style={{ color: 'var(--danger-glow, #ff6a4d)' }}>
                  ⚠ netprint の上限（10MB）を超えています。枚数を分けて2回に分割してください（セブンのマルチコピーアプリなら30MBまで可）。
                </div>
              ) : null}
              <div style={{ color: 'var(--muted)' }}>
                セブンで印刷する手順:<br />
                ① netprint / かんたんnetprint アプリにこのPDFをアップロード（共有→netprint）<br />
                ② マルチコピー機でプリント番号を入力し、用紙サイズ <b style={{ color: 'var(--ink)' }}>{paper === 'a3' ? 'A3' : 'A4'}</b>・カラーを選択<br />
                ③ <b style={{ color: 'var(--ink)' }}>倍率は必ず等倍（100%）</b>にする（「用紙に合わせる」だとカードサイズがずれます）
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// デッキ作成（ビルダー）。元 src/60-screens-init.js renderDeckBuilder/poolCards/builderAdd 等を 1:1 でReact化。
// .bd-* class は battle.css(verbatim) にあるので構造を再現すればスタイルが当たる。保存はクラウド(D1)。
// UX: リーダーは色/弾で絞り込み・選択後はコンパクト表示に折りたたみ。デッキ内容リストは開閉トグル。
//     カード画像タップで拡大（ZoomView共用）。プール検索は特徴/効果テキストも対象・並び替え可。
import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../state/engineStore';
import { IMG } from '../engine/img';
import { saveBuilderDeck } from '../state/decks';
import { ZoomView } from '../components/deck/CardZoom';
import { Icon } from '../components/ui/Icon';

const COLOR_HEX: Record<string, string> = {
  赤: '#d2473f', 緑: '#2f9e63', 青: '#3a7fc9', 紫: '#9a57d4', 黒: '#5a6170', 黄: '#c9b03a',
};
const LEADER_COLORS = ['赤', '緑', '青', '紫', '黒', '黄'];
const TYPE_JA: Record<string, string> = { CHAR: 'キャラ', EVENT: 'イベント', STAGE: 'ステージ', LEADER: 'リーダー' };
const POOL_CAP = 300;
type SortKey = 'new' | 'cost' | 'power' | 'counter';
const SORTS: Array<[SortKey, string]> = [['new', '新しい順'], ['cost', 'コスト順'], ['power', 'パワー順'], ['counter', 'カウンター順']];

function BdImg({ no, name }: { no: string; name: string }) {
  return (
    <>
      <img className="bd-img" src={IMG(no)} referrerPolicy="no-referrer" loading="lazy" decoding="async"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
      <span className="bd-fb">{name}</span>
    </>
  );
}

export default function DeckBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const engine = useEngineStore((s) => s.engine);
  const setBuilderOpen = useEngineStore((s) => s.setBuilderOpen);
  const builderDeck = useEngineStore((s) => s.builderDeck); // 編集/コピー元（新規は null）
  if (!engine) return null;
  const C: Record<string, any> = engine.C;

  // 戻る: 直前の画面（/decks や /battle）へ。URL直叩き等で履歴が無ければマイデッキへ。
  const close = () => {
    setBuilderOpen(false);
    if (location.key !== 'default') navigate(-1);
    else navigate('/decks');
  };

  // クラウド保存デッキなら上書き保存（PUT）、プリセット等はコピーとして新規保存
  const editId: string | null = builderDeck && (builderDeck as any).cloud ? builderDeck.id : null;
  const [leaderNo, setLeaderNo] = useState<string | null>(builderDeck?.leader ?? null);
  const [list, setList] = useState<Record<string, number>>({ ...(builderDeck?.list || {}) });
  const [name, setName] = useState(builderDeck ? (editId ? builderDeck.name : builderDeck.name + '（コピー）') : '');
  const [typeFilter, setTypeFilter] = useState('all');
  const [colorFilter, setColorFilter] = useState('all');
  const [packFilter, setPackFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('new');
  const [search, setSearch] = useState('');
  const [leaderSearch, setLeaderSearch] = useState('');
  const [leaderColorSel, setLeaderColorSel] = useState<string[]>([]); // 複数選択（空=全色）。選んだ色を「すべて含む」リーダーを表示（多色検索）
  const [leaderPack, setLeaderPack] = useState('all');
  const [leaderOpen, setLeaderOpen] = useState(!builderDeck?.leader); // リーダー選択セクションの展開状態（選択後は自動で畳む）
  const [showList, setShowList] = useState(true); // デッキ内容リスト（右パネル/モバイルのstickyバー内）の表示
  const [zoom, setZoom] = useState<{ no: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  const leaderColors = (no: string | null): string[] => (no && C[no] && C[no].color) || [];
  const cardLegalForLeader = (no: string, lno: string | null) => {
    const c = C[no]; if (!c || c.type === 'LEADER') return false;
    const lc = leaderColors(lno);
    return (c.color || []).some((col: string) => lc.includes(col));
  };
  const isUnlimited = (no: string) => !!(C[no] && /何枚でも入れることができる/.test(C[no].text || ''));
  const total = Object.values(list).reduce((a, b) => a + b, 0);
  const kinds = Object.values(list).filter((n) => n > 0).length;

  // 検索対象テキスト（名前・番号・特徴・効果）
  const hay = (no: string) => (
    (C[no].name || '') + ' ' + no + ' ' + (C[no].traits || []).join(' ') + ' ' + (C[no].text || '') + ' ' + (C[no].triggerText || '')
  ).toLowerCase();

  // リーダーが存在する弾一覧（リーダー絞り込み用）
  const leaderPacks = useMemo(() => {
    return [...new Set(Object.keys(C).filter((no) => C[no].leader).map((no) => no.split('-')[0]))].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // リーダー一覧（色・弾・テキストで絞り込み）
  const leaders = useMemo(() => {
    let ls = Object.keys(C).filter((no) => C[no].leader);
    if (leaderColorSel.length) ls = ls.filter((no) => leaderColorSel.every((c) => (C[no].color || []).includes(c)));
    if (leaderPack !== 'all') ls = ls.filter((no) => no.split('-')[0] === leaderPack);
    const q = leaderSearch.trim().toLowerCase();
    if (q) ls = ls.filter((no) => hay(no).includes(q));
    ls.sort((x, y) => y.localeCompare(x, undefined, { numeric: true }));
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderSearch, leaderColorSel, leaderPack]);

  // 使える弾（セット）
  const packs = useMemo(() => {
    if (!leaderNo) return [];
    return [...new Set(Object.keys(C).filter((no) => cardLegalForLeader(no, leaderNo) && !/_r\d+$/.test(no)).map((no) => no.split('-')[0]))].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderNo]);

  // プール
  const pool = useMemo(() => {
    if (!leaderNo) return [] as string[];
    let cards = Object.keys(C).filter((no) => cardLegalForLeader(no, leaderNo));
    cards = cards.filter((no) => !/_r\d+$/.test(no) || !C[no.replace(/_r\d+$/, '')]);
    if (typeFilter !== 'all') cards = cards.filter((no) => C[no].type === typeFilter);
    if (colorFilter !== 'all') cards = cards.filter((no) => (C[no].color || []).includes(colorFilter));
    if (packFilter !== 'all') cards = cards.filter((no) => no.split('-')[0] === packFilter);
    const q = search.trim().toLowerCase();
    if (q) cards = cards.filter((no) => hay(no).includes(q));
    const byNo = (x: string, y: string) => y.localeCompare(x, undefined, { numeric: true });
    if (sortKey === 'cost') cards.sort((x, y) => (C[x].cost ?? 99) - (C[y].cost ?? 99) || (C[y].power || 0) - (C[x].power || 0) || byNo(x, y));
    else if (sortKey === 'power') cards.sort((x, y) => (C[y].power || 0) - (C[x].power || 0) || byNo(x, y));
    else if (sortKey === 'counter') cards.sort((x, y) => (C[y].counter || 0) - (C[x].counter || 0) || byNo(x, y));
    else cards.sort(byNo);
    return cards;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderNo, typeFilter, colorFilter, packFilter, search, sortKey]);

  const validate = (() => {
    try { return engine.builderValidate({ leaderNo, list, name }); } catch { return { ok: total === 50 && !!leaderNo, errors: [] as string[] }; }
  })();

  function pickLeader(no: string) {
    setLeaderNo(no); setPackFilter('all'); setColorFilter('all'); setTypeFilter('all');
    setLeaderOpen(false); // 選択したらリーダー一覧を畳んでプールを広く使う
    setList((prev) => {
      const next: Record<string, number> = {};
      for (const [cn, n] of Object.entries(prev)) if (cardLegalForLeader(cn, no)) next[cn] = n;
      return next;
    });
  }
  function add(no: string) {
    if (!leaderNo) { setMsg({ text: '先にリーダーを選択', err: true }); return; }
    if (!cardLegalForLeader(no, leaderNo)) return;
    if (!isUnlimited(no) && (list[no] || 0) >= 4) { setMsg({ text: '同じカードは4枚まで', err: true }); return; }
    if (total >= 50) { setMsg({ text: 'デッキは50枚まで', err: true }); return; }
    setList((p) => ({ ...p, [no]: (p[no] || 0) + 1 }));
  }
  function remove(no: string) {
    setList((p) => { const n = (p[no] || 0) - 1; const c = { ...p }; if (n <= 0) delete c[no]; else c[no] = n; return c; });
  }
  async function save() {
    if (!leaderNo) return;
    setSaving(true); setMsg(null);
    const r = await saveBuilderDeck(engine!, { leaderNo, list, name }, editId || undefined);
    setSaving(false);
    if (r.ok) {
      if (r.deck) { engine!.G.sel = engine!.G.sel || {}; engine!.G.sel.me = r.deck.id; }
      useEngineStore.getState().bump();
      close(); // 保存後は元の画面（マイデッキ/対戦セットアップ）へ戻る
    } else {
      setMsg({ text: r.error || '保存に失敗しました', err: true });
    }
  }
  function exportJSON() {
    if (!leaderNo) { setMsg({ text: '先にリーダーを選択', err: true }); return; }
    const data = { _format: 'opcg-deck-v1', name: (name || 'マイデッキ').trim(), leader: leaderNo, list: { ...list } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (data.name.replace(/[^\wぁ-んァ-ヶ一-龠ー]/g, '_') || 'deck') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const cols = leaderColors(leaderNo);
  const deckRows = Object.entries(list).filter((e) => e[1] > 0)
    .sort((x, y) => (C[x[0]].cost || 0) - (C[y[0]].cost || 0));

  // デッキ統計（コストカーブ 0〜8+・カウンター・トリガー）
  const curve = Array(9).fill(0) as number[];
  let cnt1000 = 0, cnt2000 = 0, trigN = 0;
  for (const [no, n] of deckRows) {
    const c = C[no];
    curve[Math.min(c.cost || 0, 8)] += n;
    if (c.counter === 1000) cnt1000 += n;
    else if (c.counter === 2000) cnt2000 += n;
    if (c.triggerText || /【トリガー】/.test(c.text || '')) trigN += n; // トリガーは本文と別データ(triggerText)＝text依存では常に0だった
  }
  const curveMax = Math.max(...curve, 1);
  const statsEl = total > 0 ? (
    <div className="bd-stats">
      <div className="bd-curve">
        {curve.map((n, i) => (
          <div className="bd-cv-col" key={i} title={`コスト${i === 8 ? '8以上' : i}：${n}枚`}>
            <span className="bd-cv-n">{n || ''}</span>
            <div className="bd-cv-bar" style={{ height: Math.max(1, Math.round((n / curveMax) * 34)) }} />
            <span className="bd-cv-l">{i === 8 ? '8+' : i}</span>
          </div>
        ))}
      </div>
      <div className="bd-stats-line">
        カウンター <b>+1000×{cnt1000}</b>／<b>+2000×{cnt2000}</b>
        {trigN ? <>　トリガー <b>{trigN}</b></> : null}
      </div>
    </div>
  ) : null;

  // デッキ内容の行リスト（stickyバー内=モバイル と 右パネル=デスクトップ で共用）
  const rowsEl = deckRows.length === 0 ? <div className="bd-empty">＋でカードを追加</div> : deckRows.map(([no, n]) => (
    <div className="bd-row" key={no}>
      <span className="bd-rcost">{C[no].cost != null ? C[no].cost : '-'}</span>
      <span className="bd-rn">{C[no].name}</span>
      <span className="bd-rno">{no}</span>
      <span className="bd-rc">{n}枚</span>
      <span className="bd-rb"><button onClick={() => remove(no)}>−</button><button onClick={() => add(no)}>＋</button></span>
    </div>
  ));

  return (
    <div className="bd-wrap">
      <div className="bd-head">
        <button className="bd-back" onClick={close}><Icon.arrowLeft size={15} />戻る</button>
        <h1>{editId ? 'デッキ編集' : 'デッキ作成'}</h1>
        <span className="bd-note">
          {editId ? `「${builderDeck!.name}」を編集中。保存で上書きされます。` : '色はリーダー準拠／50枚・同名4枚まで。組んで保存でアカウントに保存。'}
        </span>
      </div>

      {/* ステータスバー */}
      {leaderNo ? (
        <div className={'bd-statusbar on' + (validate.ok ? ' complete' : '')} id="bd-status">
          <div className="bd-st-top">
            {/* key={total}＝枚数が変わるたび再マウント→ポップアニメが再生（追加の手応え） */}
            <div key={total} className={'bd-st-count' + (total === 50 ? ' ok' : '')}>{total}<span>/50</span></div>
            <input className="bd-name" placeholder="デッキ名を入力" value={name} onChange={(e) => setName(e.target.value)} />
            <div className={'bd-st-valid' + (validate.ok ? ' ok' : '')}>
              {validate.ok ? <><Icon.check size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />構築OK</> : (validate.errors && validate.errors.join(' / ')) || '構築中'}
            </div>
            <button className="bd-save" disabled={!validate.ok || saving} onClick={save}>{saving ? '保存中…' : (editId ? '上書き保存' : '保存')}</button>
            <button className="bd-exp" onClick={exportJSON}>JSON書き出し</button>
          </div>
          {msg ? <div style={{ fontSize: 12.5, color: msg.err ? 'var(--danger)' : 'var(--good)', padding: '2px 4px' }}>{msg.text}</div> : null}
          <div className="bd-st-list-head" role="button" onClick={() => setShowList((v) => !v)}>
            {showList ? <Icon.chevronDown size={12} style={{ verticalAlign: '-1px' }} /> : <Icon.chevronRight size={12} style={{ verticalAlign: '-1px' }} />} デッキ内容（{kinds}種）<span className="bd-lh-hint">タップで{showList ? '隠す' : '表示'}</span>
          </div>
          <AnimatePresence initial={false}>
            {showList ? (
              <motion.div key="mlist" style={{ overflow: 'hidden' }}
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}>
                <div className="bd-st-stats">{statsEl}</div>
                <div className="bd-deck-list">{rowsEl}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {/* リーダー選択（選択後はコンパクト表示に畳む） */}
      {leaderNo && !leaderOpen ? (
        <div className="bd-lead-cur">
          <div className="bd-lart" onClick={() => setZoom({ no: leaderNo, name: C[leaderNo].name })}>
            <BdImg no={leaderNo} name={C[leaderNo].name} />
          </div>
          <div className="bd-lc-info">
            <div className="bd-lc-name">
              {C[leaderNo].name}
              {cols.map((cc) => <span key={cc} className="bd-cdot" style={{ background: COLOR_HEX[cc] }} />)}
            </div>
            <div className="bd-lc-sub">{leaderNo}・ライフ{C[leaderNo].life}・P{C[leaderNo].power}</div>
          </div>
          <button className="bd-fbtn" onClick={() => setLeaderOpen(true)}>リーダー変更</button>
        </div>
      ) : (
        <>
          <div className="bd-leadhead">リーダーを選択：</div>
          <div className="bd-filters">
            <span className="bd-search-wrap"><Icon.search size={13} className="bd-search-ic" /><input className="bd-search has-ic" placeholder="リーダー検索（名前・特徴・番号）" value={leaderSearch} onChange={(e) => setLeaderSearch(e.target.value)} /></span>
            {['all', ...LEADER_COLORS].map((cc) => {
              // 複数選択トグル。全色=選択クリア。色チップ=on/offトグル（選んだ色を全て含むリーダーに絞る）。
              const on = cc === 'all' ? leaderColorSel.length === 0 : leaderColorSel.includes(cc);
              const toggle = () => cc === 'all'
                ? setLeaderColorSel([])
                : setLeaderColorSel((prev) => prev.includes(cc) ? prev.filter((x) => x !== cc) : [...prev, cc]);
              return (
                <button className={'bd-fbtn' + (on ? ' on' : '')} key={cc} onClick={toggle}>
                  {cc === 'all' ? '全色' : (<><span className="bd-cdot" style={{ background: COLOR_HEX[cc] }} />{cc}</>)}
                </button>
              );
            })}
            <select className="bd-fsel" value={leaderPack} onChange={(e) => setLeaderPack(e.target.value)}>
              <option value="all">全弾</option>
              {leaderPacks.map((p) => <option value={p} key={p}>{p}</option>)}
            </select>
          </div>
          <div className="bd-lead-row" id="bd-lead-row">
            {leaders.length === 0 ? <div className="bd-empty">該当リーダーなし</div> : leaders.map((no) => (
              <div className={'bd-leader' + (leaderNo === no ? ' sel' : '')} key={no} title={C[no].name} onClick={() => pickLeader(no)}>
                <div className="bd-lart">
                  <BdImg no={no} name={C[no].name} />
                  <button className="bd-zoom" title="拡大" onClick={(e) => { e.stopPropagation(); setZoom({ no, name: C[no].name }); }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon.search size={13} /></button>
                </div>
                <span>{C[no].name}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* フィルタ＋プール */}
      {leaderNo ? (
        <>
          <div className="bd-filters">
            <span className="bd-search-wrap"><Icon.search size={13} className="bd-search-ic" /><input className="bd-search has-ic" placeholder="名前・特徴・効果・番号で検索" value={search} onChange={(e) => setSearch(e.target.value)} /></span>
            {['all', 'CHAR', 'EVENT', 'STAGE'].map((t) => (
              <button className={'bd-fbtn' + (typeFilter === t ? ' on' : '')} key={t} onClick={() => setTypeFilter(t)}>
                {t === 'all' ? '全種別' : TYPE_JA[t]}
              </button>
            ))}
            {cols.length > 1 ? ['all', ...cols].map((cc) => (
              <button className={'bd-fbtn' + (colorFilter === cc ? ' on' : '')} key={cc} onClick={() => setColorFilter(cc)}>
                {cc === 'all' ? '全色' : (<><span className="bd-cdot" style={{ background: COLOR_HEX[cc] }} />{cc}</>)}
              </button>
            )) : null}
            <select className="bd-fsel" value={packFilter} onChange={(e) => setPackFilter(e.target.value)}>
              <option value="all">全弾</option>
              {packs.map((p) => <option value={p} key={p}>{p}</option>)}
            </select>
            <select className="bd-fsel" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              {SORTS.map(([k, label]) => <option value={k} key={k}>{label}</option>)}
            </select>
          </div>
          <div className="bd-poolnote" id="bd-poolnote">
            {pool.length > POOL_CAP ? `${pool.length}枚中 ${POOL_CAP}枚を表示（検索・色・種別で絞り込めます）` : `${pool.length}枚`}
            　※カード画像タップで拡大
          </div>
          <div className={'bd-main' + (showList ? '' : ' nolist')}>
            <div className="bd-pool" id="bd-pool">
              {pool.length === 0 ? <div className="bd-empty">該当するカードがありません</div> : pool.slice(0, POOL_CAP).map((no) => {
                const c = C[no]; const cnt = list[no] || 0;
                return (
                  <div className={'bd-tile' + (cnt > 0 ? ' has' : '')} key={no}>
                    <div className="bd-art" onClick={() => setZoom({ no, name: c.name })}>
                      <BdImg no={no} name={c.name} />
                      <span className="bd-cost">{c.cost != null ? c.cost : '-'}</span>
                    </div>
                    <div className="bd-nm" title={c.name}>{c.name}</div>
                    <div className="bd-sub">{TYPE_JA[c.type] || c.type}{c.power ? ' P' + c.power : ''}{c.counter ? ' +' + c.counter : ''}</div>
                    <div className="bd-ctl">
                      <button className="bd-mn" onClick={() => remove(no)}>−</button>
                      <span className="bd-num">{cnt}</span>
                      <button className="bd-pl" onClick={() => add(no)}>＋</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={'bd-panel' + (showList ? '' : ' min')} id="bd-panel">
              <div className="bd-panel-head tgl" role="button" onClick={() => setShowList((v) => !v)}>
                {showList ? <Icon.chevronDown size={12} style={{ verticalAlign: '-1px' }} /> : <Icon.chevronRight size={12} style={{ verticalAlign: '-1px' }} />} デッキ内容（{kinds}種）
              </div>
              {showList ? statsEl : null}
              {showList ? <div className="bd-rows">{rowsEl}</div> : null}
            </div>
          </div>
        </>
      ) : (
        <div className="bd-main"><div className="bd-panel"><div className="bd-empty">まずリーダーを選んでください</div></div></div>
      )}

      {/* カード拡大オーバーレイ */}
      <AnimatePresence>
        {zoom ? <ZoomView key={zoom.no} no={zoom.no} name={zoom.name} onClose={() => setZoom(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}

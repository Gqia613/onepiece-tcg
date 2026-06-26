// デッキ作成（ビルダー）。元 src/60-screens-init.js renderDeckBuilder/poolCards/builderAdd 等を 1:1 でReact化。
// .bd-* class は battle.css(verbatim) にあるので構造を再現すればスタイルが当たる。保存はクラウド(D1)。
import { useMemo, useState } from 'react';
import { useEngineStore } from '../state/engineStore';
import { IMG } from '../engine/img';
import { saveBuilderDeck } from '../state/decks';

const COLOR_HEX: Record<string, string> = {
  赤: '#d2473f', 緑: '#2f9e63', 青: '#3a7fc9', 紫: '#9a57d4', 黒: '#5a6170', 黄: '#c9b03a',
};
const TYPE_JA: Record<string, string> = { CHAR: 'キャラ', EVENT: 'イベント', STAGE: 'ステージ', LEADER: 'リーダー' };
const POOL_CAP = 300;

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
  const engine = useEngineStore((s) => s.engine);
  const setBuilderOpen = useEngineStore((s) => s.setBuilderOpen);
  if (!engine) return null;
  const C: Record<string, any> = engine.C;

  const [leaderNo, setLeaderNo] = useState<string | null>(null);
  const [list, setList] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [colorFilter, setColorFilter] = useState('all');
  const [packFilter, setPackFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [leaderSearch, setLeaderSearch] = useState('');
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

  // リーダー一覧
  const leaders = useMemo(() => {
    let ls = Object.keys(C).filter((no) => C[no].leader);
    const q = leaderSearch.trim().toLowerCase();
    if (q) ls = ls.filter((no) => (C[no].name || '').toLowerCase().includes(q) || no.toLowerCase().includes(q) || (C[no].color || []).some((cl: string) => cl === q));
    ls.sort((x, y) => y.localeCompare(x, undefined, { numeric: true }));
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderSearch]);

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
    if (q) cards = cards.filter((no) => (C[no].name || '').toLowerCase().includes(q) || no.toLowerCase().includes(q));
    cards.sort((x, y) => y.localeCompare(x, undefined, { numeric: true }));
    return cards;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderNo, typeFilter, colorFilter, packFilter, search]);

  const validate = (() => {
    try { return engine.builderValidate({ leaderNo, list, name }); } catch { return { ok: total === 50 && !!leaderNo, errors: [] as string[] }; }
  })();

  function pickLeader(no: string) {
    setLeaderNo(no); setPackFilter('all'); setColorFilter('all'); setTypeFilter('all');
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
    const r = await saveBuilderDeck(engine!, { leaderNo, list, name });
    setSaving(false);
    if (r.ok) {
      if (r.deck) { engine!.G.sel = engine!.G.sel || {}; engine!.G.sel.me = r.deck.id; }
      setBuilderOpen(false);
      useEngineStore.getState().bump();
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

  return (
    <div className="bd-wrap">
      <div className="bd-head">
        <button className="bd-back" onClick={() => setBuilderOpen(false)}>← 戻る</button>
        <h1>デッキ作成</h1>
        <span className="bd-note">色はリーダー準拠／50枚・同名4枚まで。組んで「保存して選択へ」でアカウントに保存。</span>
      </div>

      {/* ステータスバー */}
      {leaderNo ? (
        <div className="bd-statusbar on" id="bd-status">
          <div className="bd-st-top">
            <div className={'bd-st-count' + (total === 50 ? ' ok' : '')}>{total}<span>/50</span></div>
            <input className="bd-name" placeholder="デッキ名を入力" value={name} onChange={(e) => setName(e.target.value)} />
            <div className={'bd-st-valid' + (validate.ok ? ' ok' : '')}>
              {validate.ok ? '✓ 構築OK' : (validate.errors && validate.errors.join(' / ')) || '構築中'}
            </div>
            <button className="bd-save" disabled={!validate.ok || saving} onClick={save}>{saving ? '保存中…' : '保存して選択へ'}</button>
            <button className="bd-exp" onClick={exportJSON}>JSON書き出し</button>
          </div>
          {msg ? <div style={{ fontSize: 12.5, color: msg.err ? 'var(--danger)' : 'var(--good)', padding: '2px 4px' }}>{msg.text}</div> : null}
          <div className="bd-st-list-head">デッキ内容（{kinds}種）</div>
          <div className="bd-deck-list">
            {deckRows.length === 0 ? <div className="bd-empty">＋でカードを追加</div> : deckRows.map(([no, n]) => (
              <div className="bd-row" key={no}>
                <span className="bd-rcost">{C[no].cost != null ? C[no].cost : '-'}</span>
                <span className="bd-rn">{C[no].name}</span>
                <span className="bd-rno">{no}</span>
                <span className="bd-rc">{n}枚</span>
                <span className="bd-rb"><button onClick={() => remove(no)}>−</button><button onClick={() => add(no)}>＋</button></span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* リーダー選択 */}
      <div className="bd-leadhead">リーダーを選択：</div>
      <input className="bd-search bd-lsearch" placeholder="🔍 リーダーを検索（名前・色）" value={leaderSearch} onChange={(e) => setLeaderSearch(e.target.value)} />
      <div className="bd-lead-row" id="bd-lead-row">
        {leaders.length === 0 ? <div className="bd-empty">該当リーダーなし</div> : leaders.map((no) => (
          <div className={'bd-leader' + (leaderNo === no ? ' sel' : '')} key={no} title={C[no].name} onClick={() => pickLeader(no)}>
            <div className="bd-lart"><BdImg no={no} name={C[no].name} /></div>
            <span>{C[no].name}</span>
          </div>
        ))}
      </div>

      {/* フィルタ＋プール */}
      {leaderNo ? (
        <>
          <div className="bd-filters">
            <input className="bd-search" placeholder="🔍 カード名・番号で検索" value={search} onChange={(e) => setSearch(e.target.value)} />
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
          </div>
          <div className="bd-poolnote" id="bd-poolnote">
            {pool.length > POOL_CAP ? `${pool.length}枚中 ${POOL_CAP}枚を表示（検索・色・種別で絞り込めます）` : `${pool.length}枚`}
          </div>
          <div className="bd-main">
            <div className="bd-pool" id="bd-pool">
              {pool.length === 0 ? <div className="bd-empty">該当するカードがありません</div> : pool.slice(0, POOL_CAP).map((no) => {
                const c = C[no]; const cnt = list[no] || 0;
                return (
                  <div className={'bd-tile' + (cnt > 0 ? ' has' : '')} key={no}>
                    <div className="bd-art">
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
            <div className="bd-panel" id="bd-panel">
              <div className="bd-panel-head">デッキ内容（{kinds}種）</div>
              <div className="bd-rows">
                {deckRows.length === 0 ? <div className="bd-empty">＋でカードを追加</div> : deckRows.map(([no, n]) => (
                  <div className="bd-row" key={no}>
                    <span className="bd-rcost">{C[no].cost != null ? C[no].cost : '-'}</span>
                    <span className="bd-rn">{C[no].name}</span>
                    <span className="bd-rno">{no}</span>
                    <span className="bd-rc">{n}枚</span>
                    <span className="bd-rb"><button onClick={() => remove(no)}>−</button><button onClick={() => add(no)}>＋</button></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bd-main"><div className="bd-panel"><div className="bd-empty">まずリーダーを選んでください</div></div></div>
      )}
    </div>
  );
}

// デッキ選択画面（元 src/60-screens-init.js:5-70 renderSelect / doStart / setCpuStrength の JSX 化）。
// .select-wrap / .sect-label / .deck-grid / .start-row / .first-pick / .seg / .btn-primary 等の
// class名・DOM階層を 1:1 で再現（CSS は battle.css）。engine.G を読み、クリックは engine.G を更新して bump()。
import { useRef, useState } from 'react';
import { useEngineStore } from '../state/engineStore';
import { unlockAudio } from '../audio';
import type { Deck } from '../engine/types';
import { DeckCard } from '../components/deck/DeckCard';
import { DeckListModal } from '../components/deck/DeckListModal';
import { importAndSaveDeck, deleteCloudDeck } from '../state/decks';

// 元 renderSelect の tier 昇順ソート（src/60-screens-init.js:12-13）。
const TIER_RANK: Record<string, number> = { 'TIER 1': 1, 'TIER 2': 2, 'TIER 3': 3 };

export default function DeckSelect() {
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // 再描画トリガ（値は使わないが購読）
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [listDeck, setListDeck] = useState<Deck | null>(null); // カードリスト表示中のデッキ
  if (!engine) return null;
  const G = engine.G;

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const data = JSON.parse(await file.text());
      const r = await importAndSaveDeck(engine!, data);
      if (r.ok) {
        if (r.deck) G.sel!.me = r.deck.id;
        setMsg({ text: `「${r.deck.name}」をインポート＆保存しました` });
      } else {
        setMsg({ text: r.error || 'インポートに失敗しました', err: true });
      }
    } catch {
      setMsg({ text: 'JSONの読み込みに失敗しました', err: true });
    } finally {
      setBusy(false);
      useEngineStore.getState().bump();
    }
  }

  async function onDeleteDeck(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    await deleteCloudDeck(engine!, id);
    useEngineStore.getState().bump();
  }

  // 選択状態は engine.G に持つ（renderSelect の ensureSel 相当）。
  if (!G.sel) G.sel = { me: undefined, cpu: undefined };
  if (!G.firstPref) G.firstPref = 'random';
  // CPU思考モード: normal=標準ヒューリスティック / claude=Claude助言つき(毎CPU手番) / strong=ローカル探索(puct)
  const cpuMode: 'normal' | 'claude' | 'strong' = G.cpuMode || 'normal';

  const baseDecks: Deck[] = (engine.DECKS || []) as Deck[];
  const custom: Deck[] = (G.customDecks || []) as Deck[];
  const ordered: Deck[] = baseDecks
    .concat(custom)
    .slice()
    .sort((a, b) => (TIER_RANK[a.tier || ''] || 9) - (TIER_RANK[b.tier || ''] || 9));

  const bump = () => useEngineStore.getState().bump();
  const selDeck = (side: 'me' | 'cpu', id: string) => { G.sel![side] = id; bump(); };
  const setFirstPref = (v: 'random' | 'me' | 'cpu') => { G.firstPref = v; bump(); };
  const setCpuMode = (v: 'normal' | 'claude' | 'strong') => { G.cpuMode = v; bump(); };

  const ready = !!(G.sel.me && G.sel.cpu);

  async function start() {
    if (!ready) return;
    unlockAudio();
    const e = engine!;
    const mode: 'normal' | 'claude' | 'strong' = e.G.cpuMode || 'normal';
    // ★AIモードは対戦開始の“前”に確定＝1ターン目(CPU先攻でも)から有効。startGameはaiOnをリセットしない。
    e.G.aiOn = mode === 'claude';
    e.G.cpuStrength = mode === 'strong' ? 'strong' : 'normal'; // 互換
    await e.startGame(e.G.sel!.me as string, e.G.sel!.cpu as string);
    // 「強い」= ローカル探索(puct) / 「AI」= hybrid（Claude戦略×puct探索）。players は startGame で生成済み。
    if (e.G.players && e.G.players.cpu) {
      if (mode === 'strong') e.G.players.cpu.agent = 'puct';
      else if (mode === 'claude') e.G.players.cpu.agent = 'hybrid';   // Claudeが戦略shapeを返す→puctが戦術探索に注入。LLM不可なら自動でpuct/heuristicへフォールバック
    }
    useEngineStore.getState().bump();
  }

  const grid = (side: 'me' | 'cpu') => (
    <div className="deck-grid">
      {ordered.map((d) => (
        <DeckCard
          key={side + ':' + d.id}
          deck={d}
          selected={G.sel![side] === d.id}
          onSelect={() => selDeck(side, d.id)}
          onDelete={(d as any).cloud ? () => onDeleteDeck(d.id, d.name) : undefined}
          onShowList={() => setListDeck(d)}
        />
      ))}
    </div>
  );

  const seg = <V extends string>(
    label: string,
    opts: Array<[V, string]>,
    cur: V,
    onPick: (v: V) => void
  ) => (
    <div className="first-pick">
      <span className="fp-label">{label}</span>
      <div className="seg">
        {opts.map(([v, t]) => (
          <button
            key={v}
            className={'seg-btn' + (cur === v ? ' on' : '')}
            onClick={() => onPick(v)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );

  const meDeck = ordered.find((d) => d.id === G.sel!.me);
  const cpuDeck = ordered.find((d) => d.id === G.sel!.cpu);

  return (
    <div className="select-wrap">
      <h1>ONE PIECE CARD BATTLE</h1>
      <div className="hero-sub">GRAND LINE SIMULATOR</div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', margin: '4px 0 10px', flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onImportFile} />
        <button
          onClick={() => useEngineStore.getState().setBuilderOpen(true)}
          style={{
            padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
            border: '1px solid var(--gold-dim)', background: 'linear-gradient(180deg,var(--gold-soft),var(--gold-dim))',
            color: '#1a1205', fontWeight: 800, fontSize: 13.5,
          }}
        >
          🛠 デッキを作成
        </button>
        <button
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          style={{
            padding: '9px 14px', borderRadius: 10, cursor: busy ? 'default' : 'pointer',
            border: '1px solid var(--gold-dim)', background: 'linear-gradient(180deg,var(--ocean-700),var(--ocean-800))',
            color: 'var(--gold-soft)', fontWeight: 700, fontSize: 13.5,
          }}
        >
          {busy ? '読み込み中…' : '📥 インポート（JSON）'}
        </button>
        {msg ? (
          <span style={{ fontSize: 12.5, color: msg.err ? 'var(--danger)' : 'var(--good)' }}>{msg.text}</span>
        ) : null}
      </div>

      {/* 操作バー（先攻/CPU強さ/開始）。上部に通常表示（浮かせない＝static でフローに乗せる）。 */}
      <div
        className="start-row"
        style={{ position: 'static', marginTop: 4, marginBottom: 6 }}
      >
        {seg(
          '先攻',
          [['random', 'ランダム'], ['me', 'あなた'], ['cpu', 'CPU']] as Array<['random' | 'me' | 'cpu', string]>,
          (G.firstPref || 'random') as 'random' | 'me' | 'cpu',
          setFirstPref
        )}
        {seg(
          'CPU',
          [['normal', '通常'], ['strong', '強い'], ['claude', 'AI']] as Array<['normal' | 'strong' | 'claude', string]>,
          cpuMode,
          setCpuMode
        )}

        <div className="pick-info">
          あなた: <b>{meDeck ? meDeck.name : '未選択'}</b>　／　CPU: <b>{cpuDeck ? cpuDeck.name : '未選択'}</b>
        </div>

        <button className="btn-primary" disabled={!ready} onClick={start}>
          BATTLE START
        </button>

        {!ready ? (
          <div className="tip warn">
            {!G.sel.me ? '① あなたのデッキを選んでください' : '② 対戦相手のデッキを選んでください'}
          </div>
        ) : null}
      </div>

      <div className="sect-label">① あなたのデッキ</div>
      {grid('me')}

      <div className="sect-label">② 対戦相手 (CPU) のデッキ</div>
      {grid('cpu')}

      <DeckListModal deck={listDeck} C={engine.C || {}} onClose={() => setListDeck(null)} />
    </div>
  );
}

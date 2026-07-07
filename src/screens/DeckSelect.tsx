// 対戦セットアップ画面（/battle）。元 src/60-screens-init.js:5-70 renderSelect / doStart / setCpuStrength の JSX 化。
// .select-wrap / .sect-label / .deck-grid / .start-row / .first-pick / .seg / .btn-primary 等の
// class名・DOM階層を 1:1 で再現（CSS は battle.css）。engine.G を読み、クリックは engine.G を更新して bump()。
// 開始で /battle/play へ遷移。デッキの作成・管理の本体は /decks（マイデッキ）に集約。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEngineStore } from '../state/engineStore';
import { unlockAudio } from '../audio';
import type { Deck } from '../engine/types';
import { DeckCard } from '../components/deck/DeckCard';
import { DeckListModal } from '../components/deck/DeckListModal';
import { Icon } from '../components/ui/Icon';
import { deleteCloudDeck } from '../state/decks';

// 元 renderSelect の tier 昇順ソート（src/60-screens-init.js:12-13）。
const TIER_RANK: Record<string, number> = { 'TIER 1': 1, 'TIER 2': 2, 'TIER 3': 3 };

export default function DeckSelect() {
  const navigate = useNavigate();
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // 再描画トリガ（値は使わないが購読）
  const [listDeck, setListDeck] = useState<Deck | null>(null); // カードリスト表示中のデッキ
  if (!engine) return null;
  const G = engine.G;

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
    // 進行中の対戦が残っていたら破棄してから開始（/battle へ直接来た場合の保険）
    if (e.G.inGame) { try { e.backToSelect?.(); } catch { /* ignore */ } }
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
    navigate('/battle/play');
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
          onEdit={d.list ? () => { useEngineStore.getState().setBuilderOpen(true, d); navigate('/builder'); } : undefined}
          editLabel={(d as any).cloud ? '編集' : 'コピーして編集'}
          hideTier
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
      <div className="bd-head" style={{ width: '100%', maxWidth: 1000 }}>
        <button className="bd-back" onClick={() => navigate('/')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon.arrowLeft size={14} />戻る
        </button>
        <span style={{ fontFamily: '"Bebas Neue"', fontSize: 26, letterSpacing: '.06em', color: 'var(--self-glow)', fontWeight: 700 }}>対戦</span>
        <span className="bd-note">デッキを選んで対戦を開始</span>
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
          対戦開始
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

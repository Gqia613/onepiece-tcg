// 対戦セットアップ画面（/battle）— v3「固定1画面のアプリ型レイアウト」。
// - 画面はスクロールしない（カルーセルが残り高さにフィット）
// - 中央のデッキ＝現在ステップ（①あなた/②CPU）の選択（ライブ反映・決定ボタン廃止）
// - カスタムデッキとプリセットはタブで切替（カスタムがあればカスタムを先に表示）
// - 下部アクションバー: おまかせ即対戦 + 対戦開始（常時同じ位置＝親指域）
// 選択状態は従来どおり engine.G.sel に持つ（start() のロジックは不変）。
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../state/engineStore';
import { unlockAudio } from '../audio';
import type { Deck } from '../engine/types';
import { IMG } from '../engine/img';
import { DeckListModal } from '../components/deck/DeckListModal';
import { Icon } from '../components/ui/Icon';
import { deleteCloudDeck } from '../state/decks';

// 元 renderSelect の tier 昇順ソート（src/60-screens-init.js:12-13）。
const TIER_RANK: Record<string, number> = { 'TIER 1': 1, 'TIER 2': 2, 'TIER 3': 3 };

// オーラ（発光）用の実色。CSS変数だと box-shadow の色混合が効かない環境があるため直値。
const AURA_HEX: Record<string, string> = {
  赤: '#d2473f', 緑: '#2f9e63', 青: '#3a7fc9', 紫: '#9a57d4', 黒: '#7a8496', 黄: '#c9b03a',
};

function deckColors(d: Deck): string[] { return (d.colors || d.color || []) as string[]; }
function auraOf(d: Deck): string { return AURA_HEX[deckColors(d)[0]] || '#3ec9ff'; }

// VS ステージの片側スロット。デッキ未選択はプレースホルダ、選択済みはリーダー画像がスラムイン。
function VsSlot({ side, deck, active, onClick }: {
  side: 'me' | 'cpu';
  deck: Deck | undefined;
  active: boolean; // 現在このスロットのデッキを選んでいるステップか
  onClick: () => void;
}) {
  const label = side === 'me' ? 'あなた' : 'CPU';
  return (
    <button className={'vs-slot' + (active ? ' focus' : '')} onClick={onClick} title={label + 'のデッキを選ぶ'}>
      <div className="vs-card" style={deck ? ({ ['--aura' as any]: auraOf(deck) }) : undefined}>
        <AnimatePresence mode="popLayout">
          {deck ? (
            <motion.div
              key={deck.id}
              className="vs-art"
              style={{ backgroundImage: `url('${IMG(deck.leader)}')` }}
              initial={{ scale: 1.55, opacity: 0, rotate: side === 'me' ? -8 : 8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 17 }}
            />
          ) : (
            <motion.div key="empty" className="vs-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              ?
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="vs-slot-lb">
        <b>{label}</b>
        <span>{deck ? deck.name : '未選択'}</span>
      </div>
    </button>
  );
}

export default function DeckSelect() {
  const navigate = useNavigate();
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // 再描画トリガ（値は使わないが購読）
  const [listDeck, setListDeck] = useState<Deck | null>(null); // カードリスト表示中のデッキ
  const [delDeck, setDelDeck] = useState<Deck | null>(null);   // 削除確認モーダル
  const [step, setStep] = useState<'me' | 'cpu'>('me');        // ①あなた → ②CPU
  const [cat, setCat] = useState<'custom' | 'preset'>('preset'); // カルーセルの表示カテゴリ
  const catTouched = useRef(false);                            // ユーザーが手で切り替えたか
  const [activeIdx, setActiveIdx] = useState(0);               // カルーセル中央のデッキ
  const railRef = useRef<HTMLDivElement | null>(null);
  const rafPending = useRef(false);

  const G = engine?.G;

  const presetList: Deck[] = ((engine?.DECKS || []) as Deck[])
    .slice()
    .sort((a, b) => (TIER_RANK[a.tier || ''] || 9) - (TIER_RANK[b.tier || ''] || 9));
  const customList: Deck[] = ((G?.customDecks || []) as Deck[]);
  const hasCustom = customList.length > 0;
  const allDecks: Deck[] = customList.concat(presetList);
  // カスタムを先に: カスタムがあるのに未操作なら custom タブを既定にする（クラウド読込は非同期のため effect で追随）
  useEffect(() => {
    if (hasCustom && !catTouched.current && cat !== 'custom') setCat('custom');
    if (!hasCustom && cat === 'custom') setCat('preset');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCustom]);

  const ordered: Deck[] = cat === 'custom' ? customList : presetList;

  const bump = () => useEngineStore.getState().bump();

  // 中央のデッキ＝現在ステップの選択（ライブ反映）
  const bindSelection = (idx: number) => {
    const d = ordered[idx];
    if (!G || !d) return;
    if (!G.sel) G.sel = {};
    if (G.sel[step] !== d.id) { G.sel[step] = d.id; bump(); }
  };

  // カルーセル: 中央に最も近いアイテムを activeIdx に（スクロール中は rAF で間引き）
  const onRailScroll = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const rail = railRef.current;
      if (!rail || !rail.children.length) return;
      const center = rail.scrollLeft + rail.clientWidth / 2;
      let best = 0, bd = Infinity;
      Array.from(rail.children).forEach((el, i) => {
        const h = el as HTMLElement;
        const c = h.offsetLeft + h.clientWidth / 2;
        const d = Math.abs(c - center);
        if (d < bd) { bd = d; best = i; }
      });
      setActiveIdx((cur) => (cur === best ? cur : best));
      bindSelection(best);
    });
  };

  const centerTo = (i: number, smooth = true, bind = true) => {
    const n = Math.max(0, Math.min(ordered.length - 1, i));
    setActiveIdx(n);
    if (bind) bindSelection(n);
    const rail = railRef.current;
    const el = rail?.children[n] as HTMLElement | undefined;
    if (rail && el && typeof rail.scrollTo === 'function') {
      rail.scrollTo({ left: el.offsetLeft - (rail.clientWidth - el.clientWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // 初期化: あなた=リストの先頭 / CPU=ランダム（両方埋めて即対戦できる状態から始める）
  useEffect(() => {
    if (!G) return;
    if (!G.sel) G.sel = {};
    let changed = false;
    const first = (hasCustom ? customList : presetList)[0];
    if (!G.sel.me && first) { G.sel.me = first.id; changed = true; }
    if (!G.sel.cpu && presetList.length) { G.sel.cpu = presetList[Math.floor(Math.random() * presetList.length)].id; changed = true; }
    if (changed) bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // ステップ切替時: そのステップで選択済みのデッキの位置へ寄せる。
  // 別カテゴリのデッキならタブも追随（★catの変更では発火しない＝手動のタブ切替を打ち消さない）
  useEffect(() => {
    const selId = G?.sel?.[step];
    if (!selId) return;
    const inCur = ordered.findIndex((d) => d.id === selId);
    if (inCur >= 0) { centerTo(inCur, false, false); return; }
    const other: 'custom' | 'preset' = cat === 'custom' ? 'preset' : 'custom';
    const otherList = other === 'custom' ? customList : presetList;
    if (otherList.some((d) => d.id === selId)) setCat(other); // ↓のcat effectが位置合わせする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // カテゴリ切替（手動/自動とも）: 選択中デッキがこのカテゴリにあればそこへ、
  // 無ければ先頭デッキを中央に置いて選択し直す（「中央のデッキ＝選択」の原則を維持）
  useEffect(() => {
    if (!ordered.length) return;
    const selId = G?.sel?.[step];
    const i = selId ? ordered.findIndex((d) => d.id === selId) : -1;
    centerTo(i >= 0 ? i : 0, false, i < 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, ordered.length]);

  // デッキ数の変化（カスタム削除など）で activeIdx が範囲外にならないように
  useEffect(() => {
    if (activeIdx > ordered.length - 1) setActiveIdx(Math.max(0, ordered.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered.length]);

  if (!engine || !G) return null;

  if (!G.sel) G.sel = { me: undefined, cpu: undefined };
  if (!G.firstPref) G.firstPref = 'random';
  const cpuMode: 'normal' | 'claude' | 'strong' = G.cpuMode || 'normal';

  const setFirstPref = (v: 'random' | 'me' | 'cpu') => { G.firstPref = v; bump(); };
  const setCpuMode = (v: 'normal' | 'claude' | 'strong') => { G.cpuMode = v; bump(); };

  const meDeck = allDecks.find((d) => d.id === G.sel!.me);
  const cpuDeck = allDecks.find((d) => d.id === G.sel!.cpu);
  const ready = !!(meDeck && cpuDeck);
  const active: Deck | undefined = ordered[activeIdx];

  async function start() {
    if (!G!.sel!.me || !G!.sel!.cpu) return;
    unlockAudio();
    const e = engine!;
    // 進行中の対戦が残っていたら破棄してから開始（/battle へ直接来た場合の保険）
    if (e.G.inGame) { try { e.backToSelect?.(); } catch { /* ignore */ } }
    const mode: 'normal' | 'claude' | 'strong' = e.G.cpuMode || 'normal';
    // ★AIモードは対戦開始の“前”に確定＝1ターン目(CPU先攻でも)から有効。startGameはaiOnをリセットしない。
    e.G.aiOn = mode === 'claude';
    e.G.cpuStrength = mode === 'strong' ? 'strong' : 'normal'; // 互換
    // startGame は同期部で盤面を立ち上げ(inGame=true)→そのままマリガンのモーダルを出して待機する。
    // 先に /battle/play へ遷移して盤面を表示してから解決を待つ（マリガンは盤面の上に出る）。
    const started = e.startGame(e.G.sel!.me as string, e.G.sel!.cpu as string);
    useEngineStore.getState().bump();
    navigate('/battle/play');
    await started;
    // 「強い」= ローカル探索(puct) / 「AI」= hybrid（Claude戦略×puct探索）。players は startGame で生成済み。
    if (e.G.players && e.G.players.cpu) {
      if (mode === 'strong') e.G.players.cpu.agent = 'puct';
      else if (mode === 'claude') e.G.players.cpu.agent = 'hybrid';
    }
    useEngineStore.getState().bump();
  }

  // おまかせ: 両デッキを抽選して即対戦
  const randomStart = () => {
    if (!allDecks.length) return;
    const pick = () => allDecks[Math.floor(Math.random() * allDecks.length)].id;
    G.sel!.me = pick();
    G.sel!.cpu = pick();
    bump();
    void start();
  };

  const switchCat = (c: 'custom' | 'preset') => {
    catTouched.current = true;
    if (c !== cat) setCat(c); // 位置合わせと選択の付け替えは cat effect が行う
  };

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
          <button key={v} className={'seg-btn' + (cur === v ? ' on' : '')} onClick={() => onPick(v)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="select-wrap ds2">
      <div className="bd-head ds2-head">
        <button className="bd-back" onClick={() => navigate('/')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon.arrowLeft size={14} />戻る
        </button>
        <span style={{ fontFamily: '"Bebas Neue"', fontSize: 26, letterSpacing: '.06em', color: 'var(--self-glow)', fontWeight: 700 }}>対戦</span>
        <span className="bd-note">中央のデッキが選ばれます</span>
      </div>

      {/* ===== VS ステージ: 選んだリーダー同士が向き合う ===== */}
      <div className={'vs-stage' + (ready ? ' ready' : '')}>
        <VsSlot side="me" deck={meDeck} active={step === 'me'} onClick={() => setStep('me')} />
        <div className="vs-mid">
          <div className="vs-emblem">VS</div>
          {ready ? <Icon.zap size={14} /> : null}
        </div>
        <VsSlot side="cpu" deck={cpuDeck} active={step === 'cpu'} onClick={() => setStep('cpu')} />
      </div>

      {/* 設定（先攻/CPU）— 整列グリッド */}
      <div className="ds-controls">
        {seg('先攻', [['random', 'ランダム'], ['me', 'あなた'], ['cpu', 'CPU']] as Array<['random' | 'me' | 'cpu', string]>, (G.firstPref || 'random') as 'random' | 'me' | 'cpu', setFirstPref)}
        {seg('CPU', [['normal', '通常'], ['strong', '強い'], ['claude', 'AI']] as Array<['normal' | 'strong' | 'claude', string]>, cpuMode, setCpuMode)}
      </div>

      {/* ===== ステップタブ（アンダーライン・金＝VSステージの選択中スロットと対応） + カテゴリ切替 ===== */}
      <div className="ds-tabsrow">
        <div className="ds-step">
          <button className={'ds-step-tab' + (step === 'me' ? ' on' : '')} onClick={() => setStep('me')}>
            ① あなたのデッキ{meDeck ? <Icon.check size={13} /> : null}
          </button>
          <button className={'ds-step-tab' + (step === 'cpu' ? ' on' : '')} onClick={() => setStep('cpu')}>
            ② CPU のデッキ{cpuDeck ? <Icon.check size={13} /> : null}
          </button>
        </div>
        {hasCustom ? (
          <button
            className="ds-cat-toggle"
            onClick={() => switchCat(cat === 'custom' ? 'preset' : 'custom')}
            title={cat === 'custom' ? 'プリセットに切り替え' : 'マイデッキに切り替え'}
          >
            <Icon.repeat size={13} />
            {cat === 'custom' ? `マイデッキ (${customList.length})` : `プリセット (${presetList.length})`}
          </button>
        ) : null}
      </div>

      {/* ===== リーダーカルーセル（残り高さにフィット・中央=選択） ===== */}
      <div className="ds-rail-wrap" style={active ? ({ ['--aura' as any]: auraOf(active) }) : undefined}>
        <button className="ds-arrow left" aria-label="前のデッキ" onClick={() => centerTo(activeIdx - 1)}>‹</button>
        <div className="ds-rail" ref={railRef} onScroll={onRailScroll}>
          {ordered.map((d, i) => (
            <div
              key={d.id}
              className={'dsc-item' + (i === activeIdx ? ' on' : '')}
              style={{ ['--aura' as any]: auraOf(d) }}
              onClick={() => centerTo(i)}
            >
              {d.tier ? <div className="dsc-tier">{d.tier}</div> : null}
              <div className="art" style={{ backgroundImage: `url('${IMG(d.leader)}')` }}>
                <div className="scrim" />
                <div className="art-nm">{d.name}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="ds-arrow right" aria-label="次のデッキ" onClick={() => centerTo(activeIdx + 1)}>›</button>
      </div>

      {/* 中央デッキの操作（説明は出さない） */}
      <div className="dsm-actions">
        {active ? <button className="dsm-pill" onClick={() => setListDeck(active)}>カードリスト</button> : null}
        {active?.list ? (
          <button
            className="dsm-pill gold"
            onClick={() => { useEngineStore.getState().setBuilderOpen(true, active); navigate('/builder'); }}
          >
            {(active as any).cloud ? '編集' : 'コピーして編集'}
          </button>
        ) : null}
        {active && (active as any).cloud ? (
          <button className="dsm-pill danger" onClick={() => setDelDeck(active)}>削除</button>
        ) : null}
      </div>

      {/* ===== 下部アクションバー（常に同じ位置＝親指域） ===== */}
      <div className="ds-actionbar">
        <button className="ds-random" onClick={randomStart} title="デッキを2つ抽選して即対戦">
          <Icon.zap size={15} />おまかせ
        </button>
        <button className="btn-primary ds-start" disabled={!ready} onClick={() => void start()}>
          <Icon.swords size={22} />対戦開始
        </button>
      </div>

      {/* 削除確認（window.confirm の置き換え・他モーダルとデザイン統一） */}
      {delDeck ? (
        <div className="ds-confirm-back" onClick={() => setDelDeck(null)}>
          <div className="ds-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>デッキを削除</h3>
            <p>「{delDeck.name}」を削除しますか？<br />この操作は取り消せません。</p>
            <div className="ds-confirm-btns">
              <button
                className="dsc-del"
                onClick={async () => {
                  const d = delDeck; setDelDeck(null);
                  await deleteCloudDeck(engine, d.id);
                  if (G.sel!.me === d.id) G.sel!.me = undefined;
                  if (G.sel!.cpu === d.id) G.sel!.cpu = undefined;
                  useEngineStore.getState().bump();
                }}
              >削除する</button>
              <button className="dsc-cancel" onClick={() => setDelDeck(null)}>やめる</button>
            </div>
          </div>
        </div>
      ) : null}

      <DeckListModal deck={listDeck} C={engine.C || {}} onClose={() => setListDeck(null)} />
    </div>
  );
}

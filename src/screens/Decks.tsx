// マイデッキ（デッキ管理）画面。/decks でホームから遷移。
// クラウド保存デッキの閲覧・編集・削除・JSONインポートと、プリセットの閲覧/コピー編集をまとめる。
// グリッドやカードの見た目は battle.css の .select-wrap / .deck-grid / .sect-label を再利用。
import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEngineStore } from '../state/engineStore';
import type { Deck } from '../engine/types';
import { DeckCard } from '../components/deck/DeckCard';
import { DeckListModal } from '../components/deck/DeckListModal';
import { importAndSaveDeck, deleteCloudDeck } from '../state/decks';
import { Icon } from '../components/ui/Icon';

const TIER_RANK: Record<string, number> = { 'TIER 1': 1, 'TIER 2': 2, 'TIER 3': 3 };

export default function Decks() {
  const navigate = useNavigate();
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // customDecks の購読
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [listDeck, setListDeck] = useState<Deck | null>(null); // カードリスト表示中のデッキ
  const [delDeck, setDelDeck] = useState<Deck | null>(null);   // 削除確認モーダル対象
  if (!engine) return null;
  const G = engine.G;

  const custom: Deck[] = (G.customDecks || []) as Deck[];
  const presets: Deck[] = ((engine.DECKS || []) as Deck[])
    .slice()
    .sort((a, b) => (TIER_RANK[a.tier || ''] || 9) - (TIER_RANK[b.tier || ''] || 9));

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const data = JSON.parse(await file.text());
      const r = await importAndSaveDeck(engine!, data);
      if (r.ok) setMsg({ text: `「${r.deck.name}」をインポート＆保存しました` });
      else setMsg({ text: r.error || 'インポートに失敗しました', err: true });
    } catch {
      setMsg({ text: 'JSONの読み込みに失敗しました', err: true });
    } finally {
      setBusy(false);
      useEngineStore.getState().bump();
    }
  }

  // 削除はカードリストモーダル内の「削除」→確認モーダル（window.confirm廃止・DeckSelectと同デザイン）
  async function doDeleteDeck(id: string) {
    await deleteCloudDeck(engine!, id);
    useEngineStore.getState().bump();
  }

  const openBuilder = (deck?: Deck) => {
    useEngineStore.getState().setBuilderOpen(true, deck ?? null);
    navigate('/builder');
  };

  // ビルダーで保存直後に遷移してきた場合、そのデッキをお祝いパルスでハイライト
  const savedId: string | undefined = (useLocation().state as any)?.savedId;

  // タイル上のアイコン（カードリスト/編集/削除）は出さない＝タップでモーダルを開き、操作はモーダル内に集約
  const grid = (decks: Deck[]) => (
    <div className="deck-grid">
      {decks.map((d) => (
        <DeckCard
          key={d.id}
          deck={d}
          highlight={d.id === savedId}
          selected={false}
          onSelect={() => setListDeck(d)}
          hideTier
        />
      ))}
    </div>
  );

  return (
    <div className="select-wrap decks-wrap">
      <div className="bd-head" style={{ width: '100%', maxWidth: 1000 }}>
        <button className="bd-back" onClick={() => navigate('/')} aria-label="戻る" title="戻る">
          <Icon.arrowLeft size={22} />
        </button>
        <span className="bd-title">マイデッキ</span>
        <span className="bd-note">保存済みデッキの管理とプリセット</span>
      </div>

      <div className="decks-actions">
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onImportFile} />
        <button className="decks-btn gold" onClick={() => openBuilder()}>
          <Icon.tool size={14} /> デッキを作成
        </button>
        <button className="decks-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon.download size={14} /> {busy ? '読み込み中…' : 'インポート（JSON）'}
        </button>
        {msg ? (
          <span style={{ fontSize: 12.5, color: msg.err ? 'var(--danger)' : 'var(--good)' }}>{msg.text}</span>
        ) : null}
      </div>

      <div className="sect-label">マイデッキ（{custom.length}）</div>
      {custom.length > 0 ? grid(custom) : (
        <div className="decks-empty">
          まだ保存したデッキがありません。
          <button className="decks-btn gold" onClick={() => openBuilder()}><Icon.tool size={14} /> 最初のデッキを作る</button>
        </div>
      )}

      <div className="sect-label">プリセットデッキ（{presets.length}）</div>
      {grid(presets)}

      <DeckListModal
        deck={listDeck}
        C={engine.C || {}}
        onClose={() => setListDeck(null)}
        onEdit={listDeck?.list ? () => { const d = listDeck; setListDeck(null); openBuilder(d); } : undefined}
        editLabel={(listDeck as any)?.cloud ? '編集' : 'コピーして編集'}
        onDelete={(listDeck as any)?.cloud ? () => setDelDeck(listDeck) : undefined}
      />

      {/* 削除確認（DeckSelectと同デザイン） */}
      {delDeck ? (
        <div className="ds-confirm-back" onClick={() => setDelDeck(null)}>
          <div className="ds-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>デッキを削除</h3>
            <p>「{delDeck.name}」を削除しますか？<br />この操作は取り消せません。</p>
            <div className="ds-confirm-btns">
              <button
                className="dsc-del"
                onClick={async () => {
                  const d = delDeck; setDelDeck(null); setListDeck(null);
                  await doDeleteDeck(d.id);
                }}
              >削除する</button>
              <button className="dsc-cancel" onClick={() => setDelDeck(null)}>やめる</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

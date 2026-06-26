import { useEffect, useState, type CSSProperties } from 'react';
import { useAuth } from './state/auth';
import { useEngineStore } from './state/engineStore';
import { setAudioMuted } from './audio';
import Login from './screens/Login';
import DeckSelect from './screens/DeckSelect';
import DeckBuilder from './screens/DeckBuilder';
import Battle from './screens/Battle';
import { Prompt } from './components/fx/Prompt';
import { FxLayer } from './components/fx/FxLayer';
import { AtkAnnounce } from './components/fx/AtkAnnounce';
import { Toast } from './components/fx/Toast';
import { Banner } from './components/fx/Banner';
import { Thinking } from './components/fx/Thinking';
import { EndScreen } from './components/fx/EndScreen';
import { CardPreview } from './components/fx/CardPreview';
import { AIIntent } from './components/fx/AIIntent';
import { CardDetailModal } from './components/fx/CardDetailModal';
import { TrashModal } from './components/fx/TrashModal';
import { loadCloudDecks } from './state/decks';

const hamItem: CSSProperties = {
  textAlign: 'left', padding: '9px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: 'transparent', color: 'var(--ink)', fontSize: 13.5,
};

export default function App() {
  const { user, status, refresh, logout } = useAuth();
  const engine = useEngineStore((s) => s.engine);
  const initEngine = useEngineStore((s) => s.initEngine);
  const muted = useEngineStore((s) => s.muted);
  const setMuted = useEngineStore((s) => s.setMuted);
  const builderOpen = useEngineStore((s) => s.builderOpen);
  useEngineStore((s) => s.version); // 盤面状態の購読（inGame 判定）
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (user && !engine) initEngine(); }, [user, engine, initEngine]);
  // ログイン後、クラウド保存のデッキを読み込んで customDecks に反映
  useEffect(() => {
    if (!user || !engine) return;
    loadCloudDecks(engine).then(() => useEngineStore.getState().bump()).catch(() => {});
  }, [user, engine]);

  if (status === 'loading') {
    return <div className="center-wrap"><div className="loading">読み込み中…</div></div>;
  }
  if (!user) return <Login />;
  if (!engine) return <div className="center-wrap"><div className="loading">エンジン初期化中…</div></div>;

  const inGame = !!engine.G.inGame;

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    setAudioMuted(m);
  }

  return (
    <div className="appshell">
      <div className="topbar">
        <div className="logo">ONE PIECE</div>
        {inGame ? (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            ターン {engine.G.turnDisp ?? engine.G.turnSeq ?? ''}・{engine.G.active === 'me' ? 'あなた' : '相手'}
          </span>
        ) : null}
        <div className="spacer" />
        {inGame ? (
          // CPUモード表示＝デッキ選択で選んだものと一致（通常/強い/AI）。ハンバーガーの左隣に配置。
          <span
            className="tbtn"
            style={{ cursor: 'default', color: engine.G.cpuMode === 'claude' ? 'var(--gold-soft)' : 'var(--muted)' }}
            title="CPUの思考モード（デッキ選択画面で設定）"
          >
            {engine.G.cpuMode === 'claude' ? '🤖 AI' : engine.G.cpuMode === 'strong' ? '強い' : '通常'}
          </span>
        ) : null}
        {/* ハンバーガー: 効果音/デッキ選択へ/ログアウト を集約（ヘッダー混雑解消） */}
        <button className="tbtn" aria-label="メニュー" onClick={() => setMenuOpen((o) => !o)}>☰</button>
      </div>
      {menuOpen ? (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
          <div style={{
            position: 'fixed', top: 52, right: 8, zIndex: 71, minWidth: 180, padding: 6,
            background: 'linear-gradient(180deg, var(--ocean-800), var(--ocean-850))',
            border: '1px solid var(--gold-dim)', borderRadius: 10, boxShadow: '0 14px 36px #000b',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--line)', marginBottom: 2 }}>
              {user.username}
            </div>
            <button className="ham-item" style={hamItem} onClick={() => { toggleMute(); }}>
              {muted ? '🔇 効果音 OFF' : '🔊 効果音 ON'}
            </button>
            {inGame ? (
              <button className="ham-item" style={hamItem} onClick={() => { engine.backToSelect?.(); const s = useEngineStore.getState(); s.setEnd(null); s.bump(); setMenuOpen(false); }}>
                🃏 デッキ選択へ
              </button>
            ) : null}
            <button className="ham-item" style={hamItem} onClick={() => { setMenuOpen(false); logout(); }}>
              🚪 ログアウト
            </button>
          </div>
        </>
      ) : null}

      {/* 元 #screen（topbar下を占有・内部スクロール）。.select-wrap / #board / .bd-wrap がこの中で動く */}
      <div id="screen">
        {inGame ? <Battle /> : builderOpen ? <DeckBuilder /> : <DeckSelect />}
      </div>

      {/* 演出オーバーレイ（#screen の外＝body相当。position:fixed で全画面。クリップされない） */}
      <Prompt />
      <FxLayer />
      <AtkAnnounce />
      <Toast />
      <Banner />
      <Thinking />
      <EndScreen />
      <CardPreview />
      <AIIntent />
      <CardDetailModal />
      <TrashModal />
    </div>
  );
}

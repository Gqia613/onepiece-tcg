import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './state/auth';
import { useEngineStore } from './state/engineStore';
import { setAudioMuted, unlockAudio, startBgm, stopBgm, setBgmVolume as applyBgmVolume, playSfx } from './audio';
import Login from './screens/Login';
import Home from './screens/Home';
import Decks from './screens/Decks';
import DeckSelect from './screens/DeckSelect';
import DeckBuilder from './screens/DeckBuilder';
import Battle from './screens/Battle';
import { Prompt } from './components/fx/Prompt';
import { FxLayer } from './components/fx/FxLayer';
import { AtkAnnounce } from './components/fx/AtkAnnounce';
import { TriggerReveal } from './components/fx/TriggerReveal';
import { Toast } from './components/fx/Toast';
import { Banner } from './components/fx/Banner';
import { Thinking } from './components/fx/Thinking';
import { EndScreen } from './components/fx/EndScreen';
import { CardPreview } from './components/fx/CardPreview';
import { AIIntent } from './components/fx/AIIntent';
import { CardZoomOverlay } from './components/fx/CardZoomOverlay';
import { TrashModal } from './components/fx/TrashModal';
import { LethalCutIn } from './components/fx/LethalCutIn';
import { SummonCutIn } from './components/fx/SummonCutIn';
import { Icon } from './components/ui/Icon';
import { loadCloudDecks } from './state/decks';
import { LOGO_WHITE } from './engine/img';

const hamItem: CSSProperties = {
  textAlign: 'left', padding: '9px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: 'transparent', color: 'var(--ink)', fontSize: 13.5,
  display: 'flex', alignItems: 'center', gap: 8,
};

// ── 対戦BGM（public/bgm/*.mp3 を静的配信で参照）──
type BgmTrack = 'random' | 'adventure' | 'battle' | 'casual' | 'wafu';
const BGM_SRC: Record<string, string> = {
  adventure: '/bgm/adventure.mp3',
  battle: '/bgm/battle.mp3',
  casual: '/bgm/casual.mp3',
  wafu: '/bgm/wafu.mp3',
};
const BGM_KEYS = ['adventure', 'battle', 'casual', 'wafu'] as const;
// track→実ファイル。random は対戦開始（や試聴）ごとに4曲から抽選。
function resolveBgmSrc(t: BgmTrack): string {
  const key = t === 'random' ? BGM_KEYS[Math.floor(Math.random() * BGM_KEYS.length)] : t;
  return BGM_SRC[key] || BGM_SRC.adventure;
}

// ターンピル＋フェイズステッパー（元 setPhase）。リフレッシュ→ドロー→ドン→メイン→エンドの現在地を点灯。
const PHASE_STEPS = ['リフレッシュ', 'ドロー', 'ドン', 'メイン', 'エンド'];
function TurnPill({ engine }: { engine: any }) {
  const G = engine.G;
  const active: 'me' | 'cpu' | undefined = G.active;
  const cur = PHASE_STEPS.indexOf(G.phase);
  return (
    <div className={'turnpill' + (active === 'me' ? ' mine' : active === 'cpu' ? ' opp' : '')}>
      <span className="phase-tag">{G.phase || 'SETUP'}</span>
      <span className="tp-steps">
        {PHASE_STEPS.map((p, i) => (
          <i key={i} className={i === cur ? 'on' : cur >= 0 && i < cur ? 'done' : ''} title={p} />
        ))}
      </span>
      <span className="tp-turn">TURN <b>{G.turnDisp ?? G.turnSeq ?? ''}</b></span>
      {G.firstPlayer ? (
        <span
          className="tp-first"
          title="この対戦の先攻/後攻"
          style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999, border: '1px solid var(--surface-edge)', color: G.firstPlayer === 'me' ? 'var(--self-accent)' : 'var(--opp-accent)' }}
        >
          あなた{G.firstPlayer === 'me' ? '先攻' : '後攻'}
        </span>
      ) : null}
      <span
        id="whoTurn"
        style={{ color: active === 'me' ? 'var(--self-accent)' : active === 'cpu' ? 'var(--opp-accent)' : 'var(--muted)', fontWeight: 700 }}
      >
        {active ? (active === 'me' ? 'あなたの番' : '相手の番') : ''}
      </span>
    </div>
  );
}

// ログイン後のアプリ本体（トップバー＋ルーティング＋演出オーバーレイ）。
// ルート: / = ホーム / /decks = デッキ管理 / /builder = デッキ作成 / /battle = 対戦セットアップ / /battle/play = 盤面
function Shell({ username, logout }: { username: string; logout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const engine = useEngineStore((s) => s.engine);
  const muted = useEngineStore((s) => s.muted);
  const setMuted = useEngineStore((s) => s.setMuted);
  const bgmOn = useEngineStore((s) => s.bgmOn);
  const setBgmOn = useEngineStore((s) => s.setBgmOn);
  const bgmVolume = useEngineStore((s) => s.bgmVolume);
  const setBgmVolume = useEngineStore((s) => s.setBgmVolume);
  const bgmTrack = useEngineStore((s) => s.bgmTrack);
  const setBgmTrack = useEngineStore((s) => s.setBgmTrack);
  const end = useEngineStore((s) => s.end);
  const version = useEngineStore((s) => s.version); // 盤面状態の購読（inGame 判定）
  const bgmActiveRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // 画面遷移したらハンバーガーを閉じる
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // ①最初の操作でオーディオをアンロック（従来は対戦開始まで全SE無音だった）
  // ②UIボタン共通の控えめクリック音（ゲームフィール: 全操作に音の手応え。ピッチは±5%自動変化）
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button')) playSfx('click');
    };
    window.addEventListener('click', onClick);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('click', onClick); };
  }, []);

  // BGMのライフサイクル: 盤面表示中(かつ勝敗未確定・BGM ON)で再生、離脱/中断/勝敗でフェードアウト。
  // random は開始時に1回だけ抽選（version bump では再抽選しない＝ref ガードで多重startを防止）。
  useEffect(() => {
    const eng = useEngineStore.getState().engine;
    const shouldPlay = !!eng?.G.inGame && location.pathname === '/battle/play' && !end && bgmOn;
    if (shouldPlay && !bgmActiveRef.current) {
      bgmActiveRef.current = true;
      startBgm(resolveBgmSrc(bgmTrack));
    } else if (!shouldPlay && bgmActiveRef.current) {
      bgmActiveRef.current = false;
      stopBgm({ fade: true });
    }
    // bgmTrack は依存に含めない：曲変更は changeTrack が(盤面中のみ)startBgm で反映する。
  }, [location.pathname, end, bgmOn, version]);

  // 音量スライダー→再生中BGMへ即時反映
  useEffect(() => { applyBgmVolume(bgmVolume); }, [bgmVolume]);

  if (!engine) return <div className="center-wrap"><div className="loading">エンジン初期化中…</div></div>;

  const inGame = !!engine.G.inGame;
  const inPlay = inGame && location.pathname === '/battle/play'; // 盤面表示中のみHUDを出す

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    setAudioMuted(m);
  }

  function toggleBgm() {
    const on = !bgmOn;
    setBgmOn(on);
    // OFFは即停止。ONは lifecycle effect が盤面表示中を見て開始する。
    if (!on) { bgmActiveRef.current = false; stopBgm({ fade: true }); }
  }

  // 曲を切替え。ゲームプレイ画面(盤面)で再生中のときだけ即差し替え＝その場で試聴。
  // 盤面外では設定を保存するだけで音は鳴らさない（BGMはゲームプレイ画面限定）。
  function changeTrack(t: BgmTrack) {
    setBgmTrack(t);
    if (bgmOn && inPlay) {
      unlockAudio();
      bgmActiveRef.current = true;
      startBgm(resolveBgmSrc(t));
    }
  }

  // 対戦を破棄してデッキ選択へ戻る（ハンバーガーの中断ボタン）
  function abandonBattle() {
    engine!.backToSelect?.();
    const s = useEngineStore.getState();
    s.setEnd(null);
    s.bump();
    setMenuOpen(false);
    navigate('/battle');
  }

  const go = (to: string) => { setMenuOpen(false); navigate(to); };

  return (
    <div className="appshell">
      <div className={'topbar' + (inPlay ? ' inplay' : '')}>
        <div
          className="logo"
          role="button"
          title="ホームへ"
          style={{ cursor: inPlay ? 'default' : 'pointer' }}
          onClick={() => { if (!inPlay) navigate('/'); }}
        >
          <img className="logo-img" src={LOGO_WHITE} referrerPolicy="no-referrer" alt="ONE PIECE CARD GAME" />
          <small>SIM</small>
        </div>
        <div className="spacer" />
        {inPlay ? <TurnPill engine={engine} /> : null}
        <div className="spacer" />
        {/* ハンバーガー: ナビ/効果音/中断/ログアウト を集約（ヘッダー混雑解消） */}
        <button className="tbtn" aria-label="メニュー" onClick={() => setMenuOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center' }}><Icon.menu size={18} /></button>
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
              {username}
            </div>
            <button className="ham-item" style={hamItem} onClick={() => go('/')}>
              <Icon.home size={15} />ホーム
            </button>
            <button className="ham-item" style={hamItem} onClick={() => go(inGame ? '/battle/play' : '/battle')}>
              <Icon.swords size={15} />{inGame ? '対戦に戻る' : '対戦'}
            </button>
            <button className="ham-item" style={hamItem} onClick={() => go('/decks')}>
              <Icon.layers size={15} />マイデッキ
            </button>
            <button className="ham-item" style={hamItem} onClick={() => { toggleMute(); }}>
              {muted ? <><Icon.volumeMute size={15} />効果音 OFF</> : <><Icon.volume size={15} />効果音 ON</>}
            </button>
            <button className="ham-item" style={hamItem} onClick={() => { toggleBgm(); }}>
              {bgmOn ? <><Icon.music size={15} />BGM ON</> : <><Icon.musicMute size={15} />BGM OFF</>}
            </button>
            {bgmOn ? (
              <>
                <div style={{ ...hamItem, cursor: 'default' }}>
                  <Icon.volume size={15} />
                  <input
                    type="range" min={0} max={1} step={0.05} value={bgmVolume}
                    onChange={(e) => setBgmVolume(Number(e.target.value))}
                    aria-label="BGM音量"
                    style={{ flex: 1, accentColor: 'var(--gold-soft)' }}
                  />
                </div>
                <div style={{ ...hamItem, cursor: 'default' }}>
                  <Icon.disc size={15} />
                  <select
                    value={bgmTrack}
                    onChange={(e) => changeTrack(e.target.value as BgmTrack)}
                    aria-label="BGM曲"
                    style={{ flex: 1, background: 'var(--ocean-850)', color: 'var(--ink)', border: '1px solid var(--gold-dim)', borderRadius: 6, padding: '3px 6px', fontSize: 12.5 }}
                  >
                    <option value="random">ランダム</option>
                    <option value="adventure">冒険活劇</option>
                    <option value="battle">緊迫バトル</option>
                    <option value="casual">軽快カジュアル</option>
                    <option value="wafu">和風/シリアス</option>
                  </select>
                </div>
                <div style={{ padding: '2px 11px 4px', fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.4 }}>
                  Music: Kevin MacLeod (incompetech.com) — CC BY 4.0
                </div>
              </>
            ) : null}
            {inGame ? (
              <button className="ham-item" style={hamItem} onClick={abandonBattle}>
                <Icon.flag size={15} />対戦を中断
              </button>
            ) : null}
            <button className="ham-item" style={hamItem} onClick={() => { setMenuOpen(false); logout(); }}>
              <Icon.logout size={15} />ログアウト
            </button>
          </div>
        </>
      ) : null}

      {/* 元 #screen（topbar下を占有・内部スクロール）。各ルートの画面がこの中で動く */}
      <div id="screen">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/decks" element={<Decks />} />
          <Route path="/builder" element={<DeckBuilder />} />
          <Route path="/battle" element={<DeckSelect />} />
          <Route path="/battle/play" element={inGame ? <Battle /> : <Navigate to="/battle" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* 演出オーバーレイ（#screen の外＝body相当。position:fixed で全画面。クリップされない） */}
      <Prompt />
      <FxLayer />
      <AtkAnnounce />
      <TriggerReveal />
      <LethalCutIn />
      <SummonCutIn />
      <Toast />
      <Banner />
      <Thinking />
      <EndScreen />
      <CardPreview />
      <AIIntent />
      <CardZoomOverlay />
      <TrashModal />
    </div>
  );
}

export default function App() {
  const { user, status, refresh, logout } = useAuth();
  const engine = useEngineStore((s) => s.engine);
  const initEngine = useEngineStore((s) => s.initEngine);

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

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={user ? <Shell username={user.username} logout={logout} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

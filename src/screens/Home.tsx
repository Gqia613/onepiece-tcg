// ホーム（タイトル/ハブ画面）。ログイン後の玄関口として BATTLE / MY DECKS / BUILDER への導線を
// 「メニュー自体をカード（縦長パネル＋漢字ウォーターマーク＋ホロ光沢）」として並べる。
// 視覚言語は battle.css の "ABYSS NEON"（deep ocean × gold）に従い、CSS は styles.css の .home-* が所有。
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useEngineStore } from '../state/engineStore';
import { Icon } from '../components/ui/Icon';

export default function Home() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const engine = useEngineStore((s) => s.engine);
  useEngineStore((s) => s.version); // inGame / customDecks の購読
  const G = engine?.G;
  const inGame = !!G?.inGame;
  const myDecks = (G?.customDecks || []).length;
  const presets = (engine?.DECKS || []).length;

  const openBuilder = () => {
    useEngineStore.getState().setBuilderOpen(true); // 新規作成（編集元なし）
    navigate('/builder');
  };

  return (
    <div className="home-wrap">
      {/* 進行中の対戦があれば最優先の導線を出す */}
      {inGame ? (
        <button className="home-resume" onClick={() => navigate('/battle/play')}>
          <Icon.swords size={15} />
          対戦が進行中です — <b>タップで盤面に戻る</b>
        </button>
      ) : null}

      <div className="home-hero">
        <div className="home-emblem"><Icon.anchor size={30} /></div>
        <h1 className="home-title">ONE PIECE</h1>
        <div className="home-title-sub">CARD BATTLE</div>
        <div className="home-tagline">GRAND LINE SIMULATOR</div>
      </div>

      <nav className="home-menu" aria-label="メインメニュー">
        <button className="home-card hc-battle" onClick={() => navigate(inGame ? '/battle/play' : '/battle')}>
          <span className="hc-kanji" aria-hidden="true">戦</span>
          <span className="hc-icon"><Icon.swords size={22} /></span>
          <span className="hc-en">{inGame ? 'RESUME' : 'BATTLE'}</span>
          <span className="hc-ja">{inGame ? '対戦に戻る' : 'CPU対戦'}</span>
          <span className="hc-desc">デッキを選んで出航。CPUの強さは 通常／強い／AI の3段階。</span>
          <span className="hc-go"><Icon.chevronRight size={16} /></span>
        </button>

        <button className="home-card hc-decks" onClick={() => navigate('/decks')}>
          <span className="hc-kanji" aria-hidden="true">集</span>
          <span className="hc-icon"><Icon.layers size={22} /></span>
          <span className="hc-en">MY DECKS</span>
          <span className="hc-ja">デッキ管理</span>
          <span className="hc-desc">保存済みデッキの閲覧・編集・削除、JSONのインポート。</span>
          <span className="hc-go"><Icon.chevronRight size={16} /></span>
        </button>

        <button className="home-card hc-builder" onClick={openBuilder}>
          <span className="hc-kanji" aria-hidden="true">創</span>
          <span className="hc-icon"><Icon.tool size={22} /></span>
          <span className="hc-en">BUILDER</span>
          <span className="hc-ja">デッキ作成</span>
          <span className="hc-desc">全カードプールから50枚を構築してクラウドに保存。</span>
          <span className="hc-go"><Icon.chevronRight size={16} /></span>
        </button>
      </nav>

      <div className="home-foot">
        <span className="hf-chip"><Icon.disc size={12} />{user?.username ?? ''}</span>
        <span className="hf-chip"><Icon.layers size={12} />マイデッキ {myDecks}</span>
        <span className="hf-chip"><Icon.shield size={12} />プリセット {presets}</span>
      </div>
    </div>
  );
}

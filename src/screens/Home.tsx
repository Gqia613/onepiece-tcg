// ホーム（タイトル/ハブ画面）。ログイン後の玄関口として BATTLE / MY DECKS / BUILDER への導線を
// 「メニュー自体をカード（縦長パネル＋漢字ウォーターマーク＋ホロ光沢）」として並べる。
// タイトルは公式「ONE PIECE CARD GAME」ロゴ（白）＋背後にリーダーカード実物が浮遊する演出。
// 視覚言語は battle.css の "ABYSS NEON"（deep ocean × gold）に従い、CSS は styles.css の .home-* が所有。
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useEngineStore } from '../state/engineStore';
import { Icon } from '../components/ui/Icon';
import { IMG, LOGO_WHITE } from '../engine/img';

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
        {/* 背後に浮遊するリーダーカード（実カードアート＝カードゲーム感の演出） */}
        <div className="home-floats" aria-hidden="true">
          {((engine?.DECKS || []) as any[]).slice(0, 5).map((d, i) => (
            <img
              key={d.id || i}
              className={'hfc hfc' + i}
              src={IMG(d.leader)}
              referrerPolicy="no-referrer"
              decoding="async"
              alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ))}
        </div>
        <img className="home-logo" src={LOGO_WHITE} referrerPolicy="no-referrer" alt="ONE PIECE CARD GAME" />
        <div className="home-tagline">GRAND LINE SIMULATOR</div>
      </div>

      <nav className="home-menu" aria-label="メインメニュー">
        <button className="home-card hc-battle" onClick={() => navigate(inGame ? '/battle/play' : '/battle')}>
          <img className="hc-chara" aria-hidden="true" src={IMG('ST01-001')} referrerPolicy="no-referrer" decoding="async" alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="hc-icon"><Icon.swords size={28} /></span>
          <span className="hc-en">{inGame ? '対戦に戻る' : 'CPU対戦'}</span>
          <span className="hc-desc">デッキを選んで出航。CPUの強さは 通常／強い／AI の3段階。</span>
          <span className="hc-go"><Icon.chevronRight size={16} /></span>
        </button>

        <button className="home-card hc-decks" onClick={() => navigate('/decks')}>
          <img className="hc-chara" aria-hidden="true" src={IMG('OP01-025')} referrerPolicy="no-referrer" decoding="async" alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="hc-icon"><Icon.layers size={28} /></span>
          <span className="hc-en">デッキ管理</span>
          <span className="hc-desc">保存済みデッキの閲覧・編集・削除、JSONのインポート。</span>
          <span className="hc-go"><Icon.chevronRight size={16} /></span>
        </button>

        <button className="home-card hc-builder" onClick={openBuilder}>
          <img className="hc-chara" aria-hidden="true" src={IMG('OP01-013')} referrerPolicy="no-referrer" decoding="async" alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="hc-icon"><Icon.tool size={28} /></span>
          <span className="hc-en">デッキ作成</span>
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

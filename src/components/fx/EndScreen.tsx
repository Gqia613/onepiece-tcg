// 勝敗エンドスクリーン（元 src/40-ui-render.js showEndScreen()/_esMotes()/_esRain()・CSS .endscreen 系を踏襲）。
// store.end({win,reason}|null) を購読し、null でない間だけ全画面オーバーレイを出す。
//
// ★方針: 元 .endscreen / .es-* の class・DOM 階層を 1:1 で JSX 再現する（battle.css に同じ CSS が
//   verbatim コピー済みなので、class さえ合わせれば esGlow/esRing/esMote/esRainf/esTitleW… の
//   既存 keyframes がそのまま当たる）。その上に Framer の多層 motion を「ラッパー(.endscreen 自体)」へ
//   重ねて入退場（fade / 軽いズーム）を強化する。内部 es-* は CSS アニメに任せて競合を避ける。
//   win=金背景＋グロー＋リング拡大＋粒子 / lose=暗黒＋ビネット＋雨、の多層演出は元のまま。
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useEngineStore } from '../../state/engineStore';
import { useNetStore } from '../../state/netStore';
import { requestRematch, requestLobby, leaveOnline } from '../../net/onlineGame';

// 元 _esMotes(): 勝利の上昇する金粉。9個・ランダム位置/サイズ/速度。
function makeMotes() {
  return Array.from({ length: 9 }, () => ({
    left: 4 + Math.random() * 90,
    size: 5 + Math.random() * 6,
    dur: 4.6 + Math.random() * 4.2,
    delay: Math.random() * 2,
  }));
}

// 元 _esRain(): 敗北の降る雨。16本・ランダム位置/長さ/速度。
function makeRain() {
  return Array.from({ length: 16 }, () => ({
    left: Math.random() * 100,
    height: 50 + Math.random() * 70,
    dur: 1.1 + Math.random() * 1.2,
    delay: Math.random() * 1.8,
  }));
}

export function EndScreen() {
  const navigate = useNavigate();
  const engine = useEngineStore((s) => s.engine);
  const end = useEngineStore((s) => s.end);
  const online = useNetStore((s) => s.mode) === 'online';
  const replayActive = useNetStore((s) => s.replayActive);
  const [rematchAsked, setRematchAsked] = useState(false);
  const [lobbyAsked, setLobbyAsked] = useState(false);
  useEffect(() => { if (!end) { setRematchAsked(false); setLobbyAsked(false); } }, [end]); // 成立（end消滅）でリセット
  // DOが「部屋に戻る」を拒否（bad_state）したら押し直せる状態へ戻す。放置すると「部屋に戻っています…」のまま詰む
  const lobbyNak = useNetStore((s) => s.lobbyNak);
  useEffect(() => { setLobbyAsked(false); }, [lobbyNak]);

  const win = !!end?.win;
  // 粒子/雨は end が出ている間は固定（再生成でチラつかせない）。win 切替で作り直す。
  const motes = useMemo(makeMotes, [win, !!end]);
  const rain = useMemo(makeRain, [win, !!end]);

  const onReplay = () => {
    try { engine?.backToSelect(); } catch { /* ignore */ }
    useEngineStore.getState().setEnd(null);
    useEngineStore.getState().bump(); // backToSelect は render フックを呼ばないので明示再描画
    navigate('/battle'); // 対戦セットアップへ
  };
  const onRematch = () => { requestRematch(); setRematchAsked(true); };
  // 部屋（ロビー）へ戻る＝デッキと対戦設定を選び直して再戦する。片方が押せば両者が戻る（退室して作り直す必要はない）
  const onToLobby = () => { requestLobby(); setLobbyAsked(true); };
  const onLeaveOnline = () => { leaveOnline(); navigate('/online'); };

  return (
    <AnimatePresence>
      {end && (
        <motion.div
          key="endscreen"
          id="endscreen"
          className={'endscreen ' + (win ? 'win' : 'lose')}
          // 元 .endscreen の esFade(opacity) は Framer の opacity と二重になるので無効化し、
          // 入退場は Framer に任せる（内部 es-* の keyframes はそのまま活かす）。
          style={{ animation: 'none' }}
          initial={{ opacity: 0, scale: win ? 1.04 : 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: win ? 1.06 : 0.96 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
        >
          {win ? (
            // 勝利: 回転光条 → グロー → 二重リング拡大 → 上昇する金粉
            <>
              <div className="es-rays" />
              <div className="es-glow" />
              <div className="es-ring" />
              <div className="es-ring r2" />
              <div className="es-motes">
                {motes.map((m, i) => (
                  <i
                    key={i}
                    style={{
                      left: m.left + '%',
                      width: m.size + 'px',
                      height: m.size + 'px',
                      animationDuration: m.dur + 's',
                      animationDelay: m.delay + 's',
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            // 敗北: ビネットで沈む暗転 → 降る雨
            <>
              <div className="es-vignette" />
              <div className="es-rain">
                {rain.map((r, i) => (
                  <i
                    key={i}
                    style={{
                      left: r.left + '%',
                      height: r.height + 'px',
                      animationDuration: r.dur + 's',
                      animationDelay: r.delay + 's',
                    }}
                  />
                ))}
              </div>
            </>
          )}

          <div className="es-core">
            <div className="es-title">{win ? 'VICTORY' : 'DEFEAT'}</div>
            <div className="es-sub">{win ? '勝利' : '敗北'}</div>
            {end.reason && <div className="es-reason">{end.reason}</div>}
            {replayActive ? (
              // リプレイ再生の終局: 操作は下部の ReplayBar（終了する）に集約。対戦用ボタンは出さない
              <div className="es-reason" style={{ opacity: 0.8 }}>リプレイ再生（操作は下のバーから）</div>
            ) : online ? (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="es-btn" onClick={onRematch} disabled={rematchAsked || lobbyAsked}>
                  {rematchAsked ? '相手の同意待ち…' : '同じデッキでもう一度'}
                </button>
                <button className="es-btn" onClick={onToLobby} disabled={lobbyAsked}>
                  {lobbyAsked ? '部屋に戻っています…' : '部屋に戻る（デッキ変更）'}
                </button>
                <button className="es-btn" onClick={onLeaveOnline} style={{ opacity: 0.85 }}>
                  退室する
                </button>
              </div>
            ) : (
              <button className="es-btn" onClick={onReplay}>
                もう一度プレイ
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

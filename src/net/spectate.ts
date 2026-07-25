// 観戦モード。部屋コードで読み取り専用席（?obs=1）に接続し、対戦を生で追う。
// 仕組みはリプレイ再生と同じ「受動ビューア」: bootGame（onlineGame と同じ決定論プロトコル）で
// 盤面を構築し、DO が中継する入力を onRemoteInput で適用するだけ。自分からは一切入力しない
// （盤面操作は netStore.spectating で全面無効化。DO 側も観戦席の干渉メッセージを無視する）。
// 視点は常にホスト（mySeat='me' のまま＝ホストの後ろに立って観る。ホストの手札は見える）。
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import { setMatchHandler, connectRoom, leaveMatch, setMatchGame } from './matchClient';
import { resetLockstep, wireLockstep, setOnApplied, setOnBoundary, onRemoteInput } from './dispatch';
import { clockNoteInput, clockStop } from './clock';
import { bootGame, finishReplay } from './onlineGame';
import { seatOf, type S2C, type Seat } from './protocol';

let cur: { gameNo: number; seed: number } | null = null; // 観戦中のゲーム（welcome の live 判定用）
let toastId = 2_100_000_000; // onlineGame(2_000_000_000〜) と衝突しない帯域

function toast(text: string): void {
  try { useEngineStore.getState().pushFx({ type: 'toast', id: ++toastId, text }); } catch { /* ignore */ }
}

// ---- 観戦開始 ----
export async function spectateRoom(code: string): Promise<void> {
  const c = code.trim().toUpperCase();
  const net = useNetStore.getState();
  net.setMode('online');
  net.setSpectating(true);
  net.setPhase('lobby');
  net.setRoomCode(c);
  net.setDesync(false);
  net.setVerMismatch(false);
  net.setRecovering(false);
  wireLockstep();
  wireSpecWatcher();
  setMatchHandler(handleMsg);
  setOnApplied(null);
  setOnBoundary(null); // 観戦は状態ハッシュを送らない（DO 側も無視するが、そもそも送らない）
  await connectRoom(c, { observer: true });
}

// ---- 観戦終了（退出）----
export function leaveSpectate(): void {
  leaveMatch();
  setMatchHandler(null);
  setOnApplied(null);
  setOnBoundary(null);
  resetLockstep(1);
  clockStop();
  setMatchGame(0, 0);
  cur = null;
  const es = useEngineStore.getState();
  try { es.engine?.backToSelect?.(); } catch { /* ignore */ }
  es.setEnd(null);
  es.bump();
  useNetStore.getState().resetNet();
}

// ---- 受信イベント（観戦専用ハンドラ）----
function handleMsg(m: S2C): void {
  const net = useNetStore.getState();
  switch (m.t) {
    case 'joined': {
      net.setPlayers(m.players);
      net.setConfig(m.config);
      if (typeof m.obs === 'number') net.setObsCount(m.obs);
      if (m.status === 'lobby') net.setPhase('lobby');
      return;
    }
    case 'peer': {
      net.setPlayers(m.players);
      if (typeof m.obs === 'number') net.setObsCount(m.obs);
      return;
    }
    case 'config': {
      net.setConfig(m.config);
      return;
    }
    case 'start': {
      // 新しいゲームが始まった（観戦待機からの開始・リマッチも同様）
      cur = { gameNo: m.gameNo, seed: m.seed };
      useEngineStore.getState().setEnd(null);
      bootGame(m.gameNo, m.seed, m.decks, m.names, m.first, m.config, m.ts);
      net.setMySeat('me'); // 視点は常にホスト
      return;
    }
    case 'welcome': {
      // 途中参加/再接続: 盤面を構築して入力ログを高速リプレイで追いつく
      const es = useEngineStore.getState();
      const live = !!es.engine?.G?.inGame && net.phase === 'playing'
        && cur?.gameNo === m.gameNo && cur?.seed === m.seed;
      if (live) {
        for (const rec of m.inputs) { clockNoteInput(seatOf(rec.seat), rec.ts || 0); onRemoteInput(rec.seq, seatOf(rec.seat), rec.d); }
        return;
      }
      cur = { gameNo: m.gameNo, seed: m.seed };
      es.setEnd(null);
      bootGame(m.gameNo, m.seed, m.decks, m.names, m.first, m.config, m.startTs);
      net.setMySeat('me');
      const eng2 = useEngineStore.getState().engine!;
      eng2.G._sim = true;
      for (const rec of m.inputs) { clockNoteInput(seatOf(rec.seat), rec.ts || 0); onRemoteInput(rec.seq, seatOf(rec.seat), rec.d); }
      finishReplay(eng2, m.lastSeq, null);
      return;
    }
    case 'lobby': {
      // 対局が終わって部屋がロビーへ。盤面を片づけ、次の開始をそのまま待つ。
      net.setPhase('lobby');
      net.setPlayers(m.players);
      net.setConfig(m.config);
      resetLockstep(1);
      clockStop();
      setMatchGame(0, 0);
      cur = null;
      const es = useEngineStore.getState();
      try { es.resetEngine(); } catch { /* ignore */ }
      es.setEnd(null);
      es.bump();
      toast('対戦が終わりました — 次の対戦を待っています');
      return;
    }
    case 'emote': {
      net.setLastEmote({ seat: seatOf(m.seat), k: m.k, id: ++toastId });
      return;
    }
    case 'desync': {
      // プレイヤー側の同期ずれ。観戦はサーバの入力ログ追従なので何もしない（復旧を待つ）
      toast('プレイヤー側で同期ずれ — 復旧を待っています…');
      return;
    }
    case 'resync-go':
      return;
    case 'bye': {
      toast(m.reason === 'ttl' ? '部屋が時間切れで閉じられました' : '部屋が閉じられました');
      leaveSpectate();
      return;
    }
    case 'error': {
      if (m.code === 'not_found') { toast('部屋が見つかりません'); leaveSpectate(); }
      return;
    }
    default:
      return;
  }
}

// ---- 終局ウォッチャー（観戦用）: 勝敗が付いたら「〇〇の勝ち」を表示（結果申告はしない）----
let specWatcherWired = false;
function wireSpecWatcher(): void {
  if (specWatcherWired) return;
  specWatcherWired = true;
  useEngineStore.subscribe(() => {
    const net = useNetStore.getState();
    if (!net.spectating || net.phase !== 'playing') return;
    const eng = useEngineStore.getState().engine;
    if (!eng || eng.G._sim) return;
    const G = eng.G;
    const drawEnd = !G.winner && G.phase === '終了' && G.inGame;
    if (!G.winner && !drawEnd) return;
    net.setPhase('ended');
    const names = net.names || { me: 'ホスト', cpu: 'ゲスト' };
    const reason = G.winner ? `${names[G.winner as Seat] || ''} の勝ち` : '引き分け';
    // win:true = 金の勝利演出で「GAME SET」を出す（EndScreen が観戦文言に差し替える）
    useEngineStore.getState().setEnd({ win: true, reason });
  });
}

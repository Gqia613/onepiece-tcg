// オンライン対戦の進行制御（部屋の入退室・対戦開始・復帰・hash送信・投了/リマッチ）。
// matchClient(WS) のイベントをエンジン/ストアへ配線する唯一の場所。
//
// 対戦開始の決定論プロトコル（両クライアントで完全一致させる）:
//   resetEngine（uid採番/rngを初期状態へ）→ 両デッキを 'net-host'/'net-guest' で登録
//   → G.firstPref='random'（先攻はrngで決定）→ seedRng(seed) → startGame('net-host','net-guest')
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import {
  setMatchHandler, sendMatch, connectRoom, createRoom, leaveMatch, setMatchGame,
} from './matchClient';
import { resetLockstep, wireLockstep, setOnApplied, setOnBoundary, onRemoteInput, uiDispatch, lockstepNextSeq } from './dispatch';
import { seatOf, type S2C, type DeckPayload, type Seat } from './protocol';

let watchersWired = false;
let toastId = 2_000_000_000; // adapter の fxId と衝突しない帯域

function toast(text: string): void {
  try { useEngineStore.getState().pushFx({ type: 'toast', id: ++toastId, text }); } catch { /* ignore */ }
}

// ---- 入室（部屋作成/コード参加）----
export async function hostRoom(): Promise<string> {
  const code = await createRoom();
  await enterRoom(code);
  return code;
}
export async function joinRoom(code: string): Promise<void> {
  await enterRoom(code.trim().toUpperCase());
}

async function enterRoom(code: string): Promise<void> {
  const net = useNetStore.getState();
  net.setMode('online');
  net.setPhase('lobby');
  net.setRoomCode(code);
  net.setDesync(false);
  wireLockstep();
  wireWatchers();
  setMatchHandler(handleMsg);
  setOnApplied(null);
  // ターン境界（endTurn後、次の入力適用直前＝両クライアントで同一の停泊状態）で状態ハッシュを送信。
  // DO が両者の同一 n を突合し、不一致なら desync を配信する。
  setOnBoundary((n) => {
    const net2 = useNetStore.getState();
    if (net2.mode !== 'online' || net2.desync) return;
    const eng = useEngineStore.getState().engine;
    if (!eng || eng.G._sim) return; // 復帰リプレイ中は送らない（相手と比較不要・nは継続する）
    try { sendMatch({ t: 'hash', n, h: eng.hashGameState() }); } catch { /* ignore */ }
  });
  await connectRoom(code);
}

// ロビーで自分のデッキを確定（ready）。deck は {leader, list, name} に正規化して送る。
export function sendReady(deck: DeckPayload): void {
  sendMatch({ t: 'ready', deck });
}

export function forfeitOnline(): void {
  void uiDispatch({ t: 'forfeit' });
}
export function requestRematch(): void {
  sendMatch({ t: 'rematch' });
}

// 退室してオフライン既定へ戻す（ロビー/終了後/エラー時）
export function leaveOnline(): void {
  leaveMatch();
  setMatchHandler(null);
  setOnApplied(null);
  setOnBoundary(null);
  resetLockstep(1);
  const es = useEngineStore.getState();
  try { es.engine?.backToSelect?.(); } catch { /* ignore */ }
  es.setEnd(null);
  es.bump();
  useNetStore.getState().resetNet();
}

// ---- 受信イベント ----
function handleMsg(m: S2C): void {
  const net = useNetStore.getState();
  switch (m.t) {
    case 'joined': {
      net.setMySeat(seatOf(m.seat));
      net.setPlayers(m.players);
      if (m.status === 'lobby') net.setPhase('lobby');
      return;
    }
    case 'peer': {
      net.setPlayers(m.players);
      net.setOppConnected(m.players.filter((p) => p.connected).length >= 2);
      return;
    }
    case 'start': {
      startOnlineGame(m);
      return;
    }
    case 'welcome': {
      // 再接続。エンジンが同一ゲームを保持していれば差分入力を流すだけ（軽量経路）。
      // ページ再読込などで状態が無ければ、seed+デッキから再構築して入力ログを高速リプレイ（完全経路）。
      resumeOnlineGame(m);
      return;
    }
    case 'desync': {
      net.setDesync(true);
      toast('同期エラーが発生しました。この対戦は続行できません');
      return;
    }
    case 'rematch-wait': {
      if (seatOf(m.by) !== net.mySeat) toast('相手がもう一度対戦を希望しています');
      return;
    }
    case 'bye': {
      toast(m.reason === 'ttl' ? '部屋が時間切れで閉じられました' : '部屋が閉じられました');
      leaveOnline();
      return;
    }
    case 'error': {
      const msg = m.code === 'not_found' ? '部屋が見つかりません'
        : m.code === 'room_full' ? '部屋が満室です'
        : m.code === 'rate' ? '操作が速すぎます'
        : '接続エラー（' + m.code + '）';
      toast(msg);
      if (m.code === 'not_found' || m.code === 'room_full') leaveOnline();
      return;
    }
    default:
      return;
  }
}

// ---- 対戦開始（初回/リマッチ共通）----
type StartMsg = Extract<S2C, { t: 'start' }>;
type WelcomeMsg = Extract<S2C, { t: 'welcome' }>;

function bootGame(gameNo: number, seed: number, decks: StartMsg['decks'], names: StartMsg['names']): void {
  const es = useEngineStore.getState();
  const net = useNetStore.getState();
  const eng = es.resetEngine(); // uid採番・rngを初期状態に（両クライアントで一致させる）

  const seatNames = { me: names.host || 'ホスト', cpu: names.guest || 'ゲスト' };
  net.setNames(seatNames);
  net.setPhase('playing');
  net.setDesync(false);
  eng.G.names = seatNames; // エンジンのログ表記（sideName）用。ハッシュ対象外

  // 両デッキを決定的IDで登録（既存の net-* があれば差し替え）
  const reg = (d: DeckPayload, id: string) => {
    const deck = eng.builderToDeck({ leaderNo: d.leader, list: d.list, name: d.name }, id);
    return deck;
  };
  eng.G.customDecks = [
    ...(eng.G.customDecks || []).filter((x: any) => x.id !== 'net-host' && x.id !== 'net-guest'),
    reg(decks.host, 'net-host'),
    reg(decks.guest, 'net-guest'),
  ];

  resetLockstep(1);
  setMatchGame(gameNo, 0);

  eng.G.aiOn = false;
  eng.G.firstPref = 'random'; // 先攻は rng() で決定＝seed から両者一致
  eng.seedRng(seed);
  // ★cpuHuman: cpu席（ゲスト）も人間として構築。これが無いと startGame 既定の isCPU=true で
  //   ゲストのマリガンが自動判断され、手番も内蔵AIが（中継されずに）打って即desyncする。
  void eng.startGame('net-host', 'net-guest', { cpuHuman: true });
  es.bump();
}

function startOnlineGame(m: StartMsg): void {
  bootGame(m.gameNo, m.seed, m.decks, m.names);
}

// ---- 復帰（再接続 welcome）----
function resumeOnlineGame(m: WelcomeMsg): void {
  const es = useEngineStore.getState();
  const eng = es.engine;
  const net = useNetStore.getState();
  const liveSameGame = !!eng?.G?.inGame && net.phase === 'playing' && !net.desync;

  if (liveSameGame) {
    // 軽量経路: 生きている状態に不足分の入力を流すだけ（pump が順序・待ち状態を保証）
    net.setPhase('playing');
    for (const rec of m.inputs) onRemoteInput(rec.seq, seatOf(rec.seat), rec.d);
    return;
  }

  // 完全経路: seed+デッキから再構築し、入力ログを高速リプレイ（G._sim で演出・sleepを短絡）
  bootGame(m.gameNo, m.seed, m.decks, m.names);
  const eng2 = useEngineStore.getState().engine!;
  eng2.G._sim = true;
  useNetStore.getState().setPhase('playing');
  for (const rec of m.inputs) onRemoteInput(rec.seq, seatOf(rec.seat), rec.d);
  // リプレイ消化を待って通常モードへ復帰（pump はエンジンの待ち状態到達ごとに進む）
  const started = Date.now();
  const finish = () => {
    const done = !m.inputs.length || lockstepNextSeq() > m.lastSeq; // 全入力適用済み＝次seqがlastSeqを超えた
    if (done || Date.now() - started > 30000) {
      const G = eng2.G;
      G._sim = false;
      // _sim中の lose() は setPhase('終了')/終了画面を省く（MCTS用の仕様）ため、終局済みならここで正規化。
      // myActable は触らない（終局経路により値が分かれ、リプレイでも同じコードが走って自然に一致する）。
      if (G.winner) {
        G.phase = '終了';
        useNetStore.getState().setPhase('ended');
        useEngineStore.getState().setEnd({ win: G.winner === useNetStore.getState().mySeat, reason: undefined });
      }
      useEngineStore.getState().bump();
      if (!done) { useNetStore.getState().setDesync(true); toast('復帰に失敗しました（同期エラー）'); }
      return;
    }
    setTimeout(finish, 120);
  };
  setTimeout(finish, 120);
}

// ---- 監視（勝敗でphase遷移）----
function wireWatchers(): void {
  if (watchersWired) return;
  watchersWired = true;
  useEngineStore.subscribe(() => {
    const net = useNetStore.getState();
    if (net.mode !== 'online') return;
    const eng = useEngineStore.getState().engine;
    if (!eng) return;
    if (net.phase === 'playing' && eng.G.winner) net.setPhase('ended');
  });
}

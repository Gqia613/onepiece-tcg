// オンライン対戦の進行制御（部屋の入退室・対戦開始・復帰・hash送信・投了/リマッチ・
// 部屋設定・持ち時間・desync自動復旧・終局申告・エモート）。
// matchClient(WS) のイベントをエンジン/ストアへ配線する唯一の場所。
//
// 対戦開始の決定論プロトコル（両クライアントで完全一致させる）:
//   resetEngine（uid採番/rngを初期状態へ）→ 両デッキを 'net-host'/'net-guest' で登録
//   → G.firstPref（部屋設定の先攻。random ならエンジンrngで決定）→ seedRng(seed)
//   → startGame('net-host','net-guest',{cpuHuman:true})
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import {
  setMatchHandler, sendMatch, connectRoom, createRoom, leaveMatch, setMatchGame,
} from './matchClient';
import { resetLockstep, wireLockstep, setOnApplied, setOnBoundary, onRemoteInput, uiDispatch, lockstepNextSeq } from './dispatch';
import { clockReset, clockNoteInput, clockStop } from './clock';
import { seatOf, roomSeatOf, type S2C, type DeckPayload, type Seat, type RoomConfig, type RoomSeat, type MatchResult, type PlayerInfo } from './protocol';

let watchersWired = false;
let toastId = 2_000_000_000; // adapter の fxId と衝突しない帯域
let lastCanon = '';   // 直近のターン境界の正準JSON（desync時のデバッグdumpに使用）
let lastCanonN = 0;
let resultSent = false;          // 終局申告は1ゲーム1回
let lastResultMsg: MatchResult | null = null; // 直近の終局申告（WS断で落ちた場合の再送用。DOのresult受理は冪等）
let recoveryAttempted = false;   // desync自動復旧は1ゲーム1回だけ試す
// 復旧・リマッチ再現用に直近のゲーム開始情報を保持
let lastStart: { gameNo: number; seed: number; decks: Record<RoomSeat, DeckPayload>; names: Record<RoomSeat, string>; first: RoomSeat | null; config: RoomConfig; startTs: number } | null = null;

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
  net.setVerMismatch(false);
  net.setRecovering(false);
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
    try {
      const canon = eng.canonGameState();
      lastCanon = canon; lastCanonN = n; // desync時に dump するデバッグ一次資料
      sendMatch({ t: 'hash', n, h: eng.hashGameState() });
    } catch { /* ignore */ }
  });
  await connectRoom(code);
}

// ロビー: 自分のデッキを確定（ready）。ビルドIDを添えて版数を突合する。
export function sendReady(deck: DeckPayload): void {
  let ver: string | undefined;
  try { ver = __BUILD_ID__; } catch { ver = undefined; }
  sendMatch({ t: 'ready', deck, ver });
}
export function sendUnready(): void { sendMatch({ t: 'unready' }); }
// ロビー: 部屋設定（ホストのみ有効。DOが検証して全員へ配布）
export function sendConfig(config: RoomConfig): void { sendMatch({ t: 'config', config }); }

export function forfeitOnline(): void {
  void uiDispatch({ t: 'forfeit' });
}
export function requestRematch(): void {
  sendMatch({ t: 'rematch' });
}
// 終局後に部屋（ロビー）へ戻る＝デッキと対戦設定を選び直して再戦する。片方が押せば両者が戻る（DO側で冪等）。
export function requestLobby(): void {
  /* ★終局申告を先に再送する（冪等）: 申告はゲームごとに1回しか送らないため、終局の瞬間にWSが
     切断/再接続中だと申告がDOに届かないまま失われる。DOは「両者の申告」が無いと to-lobby を
     bad_state で拒否する設計（生きた対局からの逃亡防止）なので、申告が欠けたままだと
     「部屋に戻っています…」から永遠に進まなくなる。 */
  if (lastResultMsg && useNetStore.getState().phase === 'ended') {
    try { sendMatch({ t: 'result', result: lastResultMsg }); } catch { /* ignore */ }
  }
  sendMatch({ t: 'to-lobby' });
}
// 相手切断の裁定を要求（DOが猶予・接続状態を検証し、切断側の投了を代理発行）
export function claimDisconnectWin(): void {
  sendMatch({ t: 'claim', reason: 'disconnect' });
}
export function sendEmote(k: number): void {
  sendMatch({ t: 'emote', k });
}

/* ★部屋（ロビー）へ戻る（WSは維持したまま。leaveOnline と違い退室はしない）。
   実行順が重要:
     ① netStore を先に完全に lobby へ。engine を先に落とすと、ルート再評価の瞬間に phase がまだ 'playing'/'ended' で
        OnlineLobby が /battle/play へ navigate し直す（往復）／wireWatchers が playing 前提で動く余地が残る。
     ② ネットの下回りをリセット。resetLockstep は必須（前局の nextSeq が残ると次局の seq=1.. が「適用済み」として
        全て捨てられ盤面が1手も進まない／10秒の stall タイマーが残るとロビー上に desync モーダルが出る）。
     ③ 最後にエンジンを作り直す（resetEngine が backToSelect + prompt/pick/fxQueue/end/logs を一括クリア）→ bump。
        onlineGame は非コンポーネントで navigate を持てないため、G.inGame=false ＋ bump で
        App のルートガード（/battle/play は inGame が偽なら /online へ）に遷移させる＝不変条件方式。 */
export function applyLobbyReset(config: RoomConfig, players: PlayerInfo[], last: MatchResult | null): void {
  const net = useNetStore.getState();
  if (net.replayActive) return; // リプレイ再生中に盤面を壊さない

  net.setPhase('lobby');
  net.setConfig(config);
  net.setPlayers(players);
  net.setDesync(false);      // 残すと次局の入力が dispatch で全破棄される
  net.setRecovering(false);
  net.setVerMismatch(false);
  net.setEarlyMulligan(null); // 残すと次局のマリガンで前局の選択が自動送信される
  net.setOppLostAt(null);
  net.setLastEmote(null);
  net.setSending(false);
  if (last) net.setLastResult(last);
  net.bumpLobbyEpoch();      // OnlineLobby のローカルstate（readySent 等）を初期化

  resetLockstep(1);
  clockStop();
  setMatchGame(0, 0);
  lastStart = null; resultSent = false; lastResultMsg = null; recoveryAttempted = false; lastCanon = ''; lastCanonN = 0;

  const es = useEngineStore.getState();
  try { es.resetEngine(); } catch { /* ignore */ }
  es.bump();
}

// 退室してオフライン既定へ戻す（ロビー/終了後/エラー時）
export function leaveOnline(): void {
  leaveMatch();
  setMatchHandler(null);
  setOnApplied(null);
  setOnBoundary(null);
  resetLockstep(1);
  clockStop();
  lastStart = null;
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
      net.setConfig(m.config);
      /* ★取りこぼし回収: WSが切れている間に相手が「部屋に戻る」を押すと、復帰時に来るのは joined(status:'lobby') だけ
         （welcome は status==='playing' のときしか来ない）。自分だけ盤面/終了画面に取り残されるのを防ぐ。
         ★入室直後（phase は enterRoom で既に 'lobby'）では走らせない: CPU対戦中に部屋を作った人の盤面を壊すため。 */
      if (m.status === 'lobby' && (net.phase === 'playing' || net.phase === 'ended')) {
        applyLobbyReset(m.config, m.players, null);
        return;
      }
      if (m.status === 'lobby') net.setPhase('lobby');
      /* ★再接続時の終局申告リカバリ: 終局の瞬間にWSが切れていると申告が失われたまま（1ゲーム1回送信のため）。
         DO側がまだ playing のまま＝申告が揃っていない可能性が高いので、冪等な result を送り直しておく。
         これが無いと「部屋に戻る」が bad_state で拒否され続ける。 */
      if (m.status === 'playing' && net.phase === 'ended' && lastResultMsg) {
        try { sendMatch({ t: 'result', result: lastResultMsg }); } catch { /* ignore */ }
      }
      return;
    }
    case 'peer': {
      net.setPlayers(m.players);
      const oppSeatRoom = roomSeatOf(net.mySeat === 'me' ? 'cpu' : 'me');
      const opp = m.players.find((p) => p.seat === oppSeatRoom);
      const oppConnected = !!opp?.connected && m.players.length >= 2;
      net.setOppConnected(oppConnected);
      // 勝利宣言の起点時刻（ローカル計時。DO側でも猶予を再検証する）
      if (net.phase === 'playing') {
        if (!oppConnected && net.oppLostAt == null && m.players.length >= 2) net.setOppLostAt(Date.now());
        if (oppConnected && net.oppLostAt != null) net.setOppLostAt(null);
      }
      return;
    }
    case 'config': {
      net.setConfig(m.config);
      return;
    }
    case 'version-mismatch': {
      net.setVerMismatch(true);
      toast('アプリの版が相手と異なります。両者ページを再読み込みしてください');
      return;
    }
    case 'start': {
      startOnlineGame(m);
      return;
    }
    case 'welcome': {
      resumeOnlineGame(m);
      return;
    }
    case 'desync': {
      // デバッグ: 境界時点の正準状態をDOへ預ける（/rooms/:code/dump で回収可能）
      try { if (lastCanon) sendMatch({ t: 'dump', n: lastCanonN, state: lastCanon }); } catch { /* ignore */ }
      // 自動復旧（1ゲーム1回）: サーバの入力ログが正。両者が seed+全ログから再構築して続行する
      if (!recoveryAttempted && lastStart) {
        recoveryAttempted = true;
        net.setRecovering(true);
        toast('同期のずれを検出 — 自動復旧しています…');
        void performResync();
        return;
      }
      net.setDesync(true);
      net.setRecovering(false);
      toast('同期エラーが発生しました。この対戦は続行できません');
      return;
    }
    case 'resync-go': {
      // 両者の再構築が完了（hash台帳リセット済み）。続行。
      net.setRecovering(false);
      toast('同期エラーから復旧しました');
      return;
    }
    case 'emote': {
      net.setLastEmote({ seat: seatOf(m.seat), k: m.k, id: ++toastId });
      return;
    }
    case 'result-saved': {
      return; // 戦績保存の確認（UIは戦績画面で反映）
    }
    case 'rematch-wait': {
      if (seatOf(m.by) !== net.mySeat) toast('相手がもう一度対戦を希望しています');
      return;
    }
    // 部屋（ロビー）へ戻った。ready は DO 側で解除済み＝両者ともデッキ選択からやり直す。
    case 'lobby': {
      applyLobbyReset(m.config, m.players, m.last);
      toast('部屋に戻りました — デッキと対戦設定を選び直せます');
      return;
    }
    case 'bye': {
      toast(m.reason === 'ttl' ? '部屋が時間切れで閉じられました' : '部屋が閉じられました');
      leaveOnline();
      return;
    }
    case 'error': {
      if (m.code === 'claim_rejected') { toast('まだ勝利宣言できません（相手の切断から90秒必要です）'); return; }
      if (m.code === 'bad_state') { net.bumpLobbyNak(); toast('まだ対戦が終わっていません — もう一度お試しください'); return; } // lobbyNak++ = EndScreenの「部屋に戻る」を押し直せる状態に戻す
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

// ---- 対戦開始（初回/リマッチ/復旧共通）----
type StartMsg = Extract<S2C, { t: 'start' }>;
type WelcomeMsg = Extract<S2C, { t: 'welcome' }>;

function bootGame(gameNo: number, seed: number, decks: Record<RoomSeat, DeckPayload>, names: Record<RoomSeat, string>, first: RoomSeat | null, config: RoomConfig, startTs: number): void {
  const es = useEngineStore.getState();
  const net = useNetStore.getState();
  const eng = es.resetEngine(); // uid採番・rngを初期状態に（両クライアントで一致させる）

  lastStart = { gameNo, seed, decks, names, first, config, startTs };
  const seatNames = { me: names.host || 'ホスト', cpu: names.guest || 'ゲスト' };
  net.setNames(seatNames);
  net.setPhase('playing');
  net.setDesync(false);
  net.setEarlyMulligan(null); // マリガン先行入力をリセット（リマッチ対応）
  net.setConfig(config);
  net.setOppLostAt(null);
  eng.G.names = seatNames; // エンジンのログ表記（sideName）用。ハッシュ対象外

  // 両デッキを決定的IDで登録（既存の net-* があれば差し替え）
  const reg = (d: DeckPayload, id: string) => eng.builderToDeck({ leaderNo: d.leader, list: d.list, name: d.name }, id);
  eng.G.customDecks = [
    ...(eng.G.customDecks || []).filter((x: any) => x.id !== 'net-host' && x.id !== 'net-guest'),
    reg(decks.host, 'net-host'),
    reg(decks.guest, 'net-guest'),
  ];

  resetLockstep(1);
  setMatchGame(gameNo, 0);
  resultSent = false;
  lastResultMsg = null;
  recoveryAttempted = false;
  clockReset(config.clock, startTs, Date.now());

  eng.G.aiOn = false;
  // 先攻: 部屋設定（host/guest/alt はDOが確定済み）。random は rng() で決定＝seed から両者一致
  eng.G.firstPref = first == null ? 'random' : first === 'host' ? 'me' : 'cpu';
  eng.seedRng(seed);
  // ★cpuHuman: cpu席（ゲスト）も人間として構築。これが無いと startGame 既定の isCPU=true で
  //   ゲストのマリガンが自動判断され、手番も内蔵AIが（中継されずに）打って即desyncする。
  void eng.startGame('net-host', 'net-guest', { cpuHuman: true });
  es.bump();
}

function startOnlineGame(m: StartMsg): void {
  bootGame(m.gameNo, m.seed, m.decks, m.names, m.first, m.config, m.ts);
}

// ---- 復帰（再接続 welcome）----
function resumeOnlineGame(m: WelcomeMsg): void {
  const es = useEngineStore.getState();
  const eng = es.engine;
  const net = useNetStore.getState();
  const liveSameGame = !!eng?.G?.inGame && net.phase === 'playing' && !net.desync
    && lastStart?.gameNo === m.gameNo && lastStart?.seed === m.seed;

  if (liveSameGame) {
    // 軽量経路: 生きている状態に不足分の入力を流すだけ（pump が順序・待ち状態を保証）
    net.setPhase('playing');
    for (const rec of m.inputs) { clockNoteInput(seatOf(rec.seat), rec.ts || 0); onRemoteInput(rec.seq, seatOf(rec.seat), rec.d); }
    return;
  }

  // 完全経路: seed+デッキから再構築し、入力ログを高速リプレイ（G._sim で演出・sleepを短絡）
  bootGame(m.gameNo, m.seed, m.decks, m.names, m.first, m.config, m.startTs);
  const eng2 = useEngineStore.getState().engine!;
  eng2.G._sim = true;
  useNetStore.getState().setPhase('playing');
  for (const rec of m.inputs) { clockNoteInput(seatOf(rec.seat), rec.ts || 0); onRemoteInput(rec.seq, seatOf(rec.seat), rec.d); }
  finishReplay(eng2, m.lastSeq, null);
}

// リプレイ消化を待って通常モードへ復帰。afterDone は desync 復旧時の追加処理。
function finishReplay(eng2: any, lastSeq: number, afterDone: (() => void) | null): void {
  const started = Date.now();
  const finish = () => {
    const done = lastSeq <= 0 || lockstepNextSeq() > lastSeq; // 全入力適用済み＝次seqがlastSeqを超えた
    if (done || Date.now() - started > 30000) {
      const G = eng2.G;
      G._sim = false;
      // _sim中の lose() は setPhase('終了')/終了画面を省く（MCTS用の仕様）ため、終局済みならここで正規化。
      if (G.winner) {
        G.phase = '終了';
        useNetStore.getState().setPhase('ended');
        useEngineStore.getState().setEnd({ win: G.winner === useNetStore.getState().mySeat, reason: undefined });
      }
      useEngineStore.getState().bump();
      if (!done) { useNetStore.getState().setDesync(true); toast('復帰に失敗しました（同期エラー）'); }
      else if (afterDone) afterDone();
      return;
    }
    setTimeout(finish, 120);
  };
  setTimeout(finish, 120);
}

// desync自動復旧: サーバの入力ログを正として全再構築 → 完了を申告（両者揃うと resync-go）
async function performResync(): Promise<void> {
  const ls = lastStart!;
  bootGame(ls.gameNo, ls.seed, ls.decks, ls.names, ls.first, ls.config, ls.startTs);
  recoveryAttempted = true; // bootGame がリセットするため立て直す（復旧は1ゲーム1回）
  const eng2 = useEngineStore.getState().engine!;
  eng2.G._sim = true;
  useNetStore.getState().setRecovering(true);
  // 全入力を要求（resume は個別 input として届き、pump が順序適用する）
  sendMatch({ t: 'resume', afterSeq: 0 });
  // 進捗が止まったら（=ログを消化しきったら）_simを解いて resync 申告
  let lastSeen = -1; let stable = 0;
  const poll = () => {
    const cur = lockstepNextSeq();
    if (cur === lastSeen) stable++; else { stable = 0; lastSeen = cur; }
    if (stable >= 8) { // ~1秒進捗なし＝消化完了とみなす
      finishReplay(eng2, cur - 1, () => { sendMatch({ t: 'resync' }); });
      return;
    }
    setTimeout(poll, 120);
  };
  setTimeout(poll, 400);
}

// ---- 監視（勝敗/引き分けでphase遷移＋終局申告）----
function wireWatchers(): void {
  if (watchersWired) return;
  watchersWired = true;
  useEngineStore.subscribe(() => {
    const net = useNetStore.getState();
    if (net.mode !== 'online') return;
    const eng = useEngineStore.getState().engine;
    if (!eng) return;
    const G = eng.G;
    if (net.phase !== 'playing' || G._sim) return;

    const drawEnd = !G.winner && G.phase === '終了' && G.inGame; // timeup（両者敗北）
    if (!G.winner && !drawEnd) return;

    net.setPhase('ended');
    if (drawEnd) {
      useEngineStore.getState().setEnd({ win: false, reason: '時間切れ（両者敗北）' });
    }
    if (!resultSent) {
      resultSent = true;
      const end = useEngineStore.getState().end;
      const result: MatchResult = {
        winner: G.winner ? roomSeatOf(G.winner as Seat) : 'draw',
        reason: (end?.reason as string) || (drawEnd ? '時間切れ（両者敗北）' : ''),
        turns: G.turnDisp || G.turnSeq || 0,
      };
      lastResultMsg = result;
      try { sendMatch({ t: 'result', result }); } catch { /* ignore */ }
    }
  });
}

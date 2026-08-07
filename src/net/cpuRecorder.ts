// CPU戦（オフライン対戦）のリプレイ内部収集。
// オンライン対戦の replay JSON（{seed, decks, names, first, inputs}）と同形で記録し、
// 終局時に /api/match/cpu へ送って D1 cpu_matches に保存する（学習・解析用。UI表示はしない）。
//
// 再現性の前提（欠けるとリプレイ不能になるので変更時は必ずここを見直す）:
//  - DeckSelect.start() が startGame の前に seedRng(seed) を呼ぶ（このモジュールに seed を渡す）
//  - CPU の意思決定は「同一コミット＋同一シード」で決定的（puct は sims 回数制限・Math.random 不使用・
//    aiOn=false で Claude 注入なし）。ビルドIDを cfg.ver に記録し、リプレイは同コミットの worktree で行う
//  - 人間入力はオフライン分岐のチョークポイント（interaction.ts / Prompt.tsx / Controls.tsx）から
//    recordCpuInput() で GameInput 語彙のまま収集する。local:true の確認（誤タップ救済・ターン終了確認）は
//    オンライン中継と同じく記録しない（リプレイ適用時は直接エンジンを呼ぶため確認ゲート自体が無い）
import { useEngineStore } from '../state/engineStore';
import { useNetStore } from '../state/netStore';
import type { DeckPayload, GameInput, SeqInput } from './protocol';

interface CpuRecordingMeta {
  seed: number;
  firstPref: 'random' | 'me' | 'cpu';
  deckIds: { me: string; cpu: string };
  deckNames: { me: string; cpu: string };
  playerName: string;
}

interface CpuRecording {
  engine: any;
  meta: CpuRecordingMeta;
  decks: Record<'host' | 'guest', DeckPayload>;
  inputs: SeqInput[];
  seq: number;
  unsub: () => void;
  done: boolean;
  // 記録開始時点の store.end 参照。前局の勝敗画面が未クリアのまま新局が始まっても
  // 「同一参照の end」は終局扱いしない（実終局の setEnd は必ず新オブジェクト）。
  endAtStart: unknown;
  // 開始時点の uid カウンタ値（=この対戦の最小uid-1）。同一セッション2戦目以降のリプレイ再現用。
  uidBase: number;
}

let rec: CpuRecording | null = null;

// 盤面の全ゾーンを歩いてデッキリストを復元する（プリセット定義の将来変更に依存しない）。
// startGame の同期部完了直後に呼ぶ＝トラッシュ/除外が空で、リーダー＋50枚が deck/hand/life に揃っている。
function snapshotDeck(G: any, side: 'me' | 'cpu', name: string): DeckPayload {
  const P = G.players[side];
  const list: Record<string, number> = {};
  const zones: any[] = [P.deck || [], P.hand || [], P.life || [], P.trash || [], P.chars || []];
  if (P.stage) zones.push([P.stage]);
  for (const z of zones) for (const c of z) { if (c && c.no) list[c.no] = (list[c.no] || 0) + 1; }
  return { leader: P.leader?.no || '', list, name };
}

// DeckSelect.start() から startGame 呼び出し「直後」（同期部で盤面構築済み・マリガン応答前）に呼ぶ。
export function beginCpuRecording(engine: any, meta: CpuRecordingMeta): void {
  endCpuRecording(); // 前局の記録が残っていれば破棄（backToSelect からの再戦など）
  const G = engine.G;
  if (!G || !G.players || !G.players.me || !G.players.cpu) return;
  const decks = {
    host: snapshotDeck(G, 'me', meta.deckNames.me),
    guest: snapshotDeck(G, 'cpu', meta.deckNames.cpu),
  };
  // uid採番はページロードから連番＝同一セッション2戦目以降は開始uidがズレる。
  // リプレイ再現用に「この対戦の最小uid-1」（=開始時点のカウンタ値）を記録する（scripts/cpu-replay-dump.ts が使用）。
  let minUid = Infinity;
  for (const side of ['me', 'cpu'] as const) {
    const P = G.players[side];
    const zones: any[] = [[P.leader], P.deck || [], P.hand || [], P.life || [], P.trash || [], P.chars || []];
    if (P.stage) zones.push([P.stage]);
    for (const z of zones) for (const c of z) { if (c && typeof c.uid === 'number' && c.uid < minUid) minUid = c.uid; }
  }
  const uidBase = Number.isFinite(minUid) ? minUid - 1 : 0;
  // 終局検知: store 購読で「勝敗画面(end)」の出現を見る（コンポーネント非依存）
  const unsub = useEngineStore.subscribe(() => check());
  rec = { engine, meta, decks, inputs: [], seq: 0, unsub, done: false, endAtStart: useEngineStore.getState().end, uidBase };
}

// オフライン分岐の各チョークポイントから呼ぶ。オンライン中・非記録中は無視。
export function recordCpuInput(d: GameInput): void {
  if (!rec || rec.done) return;
  if (useNetStore.getState().mode === 'online') return;
  rec.seq += 1;
  rec.inputs.push({ seq: rec.seq, seat: 'host', d, ts: Date.now() });
}

export function endCpuRecording(): void {
  if (!rec) return;
  try { rec.unsub(); } catch { /* ignore */ }
  rec = null;
}

function check(): void {
  if (!rec || rec.done) return;
  const G = rec.engine.G;
  if (!G) return;
  // ★AI探索(_sim)中の一時状態は見ない。さらに終局の信号は「勝敗画面(end)」のみを使う＝
  //   lose() は _sim 中に G.winner だけ立てて showEndScreen へ到達させないため、end は sim 安全。
  //   素の G.winner をトリガにすると探索ロールアウトの一時 winner を誤検知する
  //   （本番 cpu_matches 38/39件が winner='draw'・inputs途中切断で破損した実バグ・2026-08-07修正）。
  if (G._sim) return;
  const end = useEngineStore.getState().end;
  if (end && end !== rec.endAtStart) {
    // 検知した瞬間の値で結果を確定する（後読みすると状態が変わり得る）。
    const winner = G.winner === 'me' ? 'host' : G.winner === 'cpu' ? 'guest' : null;
    rec.done = true;
    const r = rec;
    endCpuRecording();
    if (winner) void upload(r, { winner, reason: (end as { reason?: string }).reason || '', turns: G.turnSeq || 0 });
    return;
  }
  if (!G.inGame) endCpuRecording(); // 終局前に盤面が破棄された（中断）＝記録しない
}

async function upload(r: CpuRecording, result: { winner: 'host' | 'guest'; reason: string; turns: number }): Promise<void> {
  let ver = '';
  try { ver = __BUILD_ID__; } catch { /* dev */ }
  const G = r.engine.G;
  const replay = {
    seed: r.meta.seed,
    decks: r.decks,
    names: { host: r.meta.playerName || 'あなた', guest: r.meta.deckNames.cpu + '(CPU)' },
    first: r.meta.firstPref === 'me' ? 'host' : r.meta.firstPref === 'cpu' ? 'guest' : null,
    inputs: r.inputs,
    // agent はマリガン中は startGame 既定のまま・終了後に puct が設定される（DeckSelect.start() の順序）。
    // リプレイ実装時は同じ順序を再現すること（CPUのマリガン判断が変わり以降が全てズレる）。
    // puctCap: モバイル端末の探索上限（G._puctCap）。CPUの着手が変わるため、リプレイ再生時は同値を設定すること。
    cpu: { agent: 'puct', cpuMode: 'strong', aiOn: false, puctCap: G._puctCap || null, firstPref: r.meta.firstPref, deckIds: r.meta.deckIds, ver, uidBase: r.uidBase },
  };
  const body = JSON.stringify({
    ver,
    seed: r.meta.seed,
    leader: r.decks.host.leader,
    cpu_leader: r.decks.guest.leader,
    winner: result.winner,
    reason: result.reason,
    turns: result.turns,
    replay,
  });
  if (body.length > 900000) return; // D1 行サイズ安全域（room.ts と同基準）
  try {
    await fetch('/api/match/cpu', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true, // 終局直後にタブを閉じても送信を試みる
    });
  } catch { /* 内部収集のみ＝失敗しても対戦体験に影響させない */ }
}

// MatchRoom Durable Object — 1部屋=1インスタンス（idFromName(部屋コード)）。
// 役割は「対戦入力(input)の全順序付け（seq採番）・記録・全員への中継」＋部屋運営
// （設定・版数照合・切断裁定・エモート中継・終局記録・desync復旧調停）。
// ゲームロジック（OPCGエンジン）は一切持たない（ロックステップはクライアント側で成立）。
//
// - WebSocket Hibernation（ctx.acceptWebSocket）: アイドル中は課金ゼロ。ping/pong は
//   setWebSocketAutoResponse で DO を起こさず応答。
// - 状態は毎メッセージ storage(SQLiteバックエンド) に永続化し、ハイバネーション復帰に備える。
// - hash: 各クライアントがターン境界で送る状態ハッシュを突合し、不一致なら desync を配信。
//   その後は両者の resync（ログ再構築完了）を待って台帳をリセットし続行を許可する。
// - 入力には受信時刻 ts を付与して配布＝クライアントの持ち時間（チェスクロック）の共通時計になる。
// - TTL: alarm で放置部屋を掃除（未start 30分 / アクティビティ停止 2時間 / 開始から 6時間）。
import type {
  GameInput, DeckPayload, PlayerInfo, RoomSeat, RoomStatus, C2S, S2C, SeqInput,
  RoomConfig, MatchResult,
} from '../../src/net/protocol';
import { DEFAULT_CONFIG, EMOTES } from '../../src/net/protocol';

interface RoomRecord {
  code: string;
  status: RoomStatus;
  hostUid: string;
  hostName: string;
  guestUid: string | null;
  guestName: string | null;
  ready: { host: boolean; guest: boolean };
  decks: { host: DeckPayload | null; guest: DeckPayload | null };
  vers: { host: string | null; guest: string | null };      // クライアントのビルドID（不一致なら開始しない）
  config: RoomConfig;
  first: RoomSeat | null;                                    // このゲームの先攻（null=ランダム=クライアントがrngで決定）
  rematch: { host: boolean; guest: boolean };
  gameNo: number;
  seed: number;
  nextSeq: number;
  startTs: number;                                           // 現ゲームの開始時刻（クロックの元期）
  hashes: { host: { n: number; h: string } | null; guest: { n: number; h: string } | null };
  desynced: boolean;
  resyncReq: { host: boolean; guest: boolean };              // desync復旧: ログ再構築完了の申告
  connLost: { host: number | null; guest: number | null };   // 席の全ソケット切断時刻（claim検証用）
  results: { host: MatchResult | null; guest: MatchResult | null };
  resultSaved: boolean;
  createdAt: number;
  startedAt: number;
  lastActivity: number;
}

interface Attachment { seat: RoomSeat; uid: string; name: string }

interface Env { DB?: D1Database; CLAIM_GRACE_MS?: string }

const LOBBY_TTL_MS = 30 * 60 * 1000;      // 未start の部屋
const IDLE_TTL_MS = 2 * 60 * 60 * 1000;   // 入力が止まってから
const HARD_TTL_MS = 6 * 60 * 60 * 1000;   // start からの上限
const RATE_LIMIT_PER_SEC = 20;            // ソケットごとの受信メッセージ上限
const CLAIM_GRACE_MS = 90 * 1000;         // 相手切断→勝利宣言が可能になるまでの猶予

const inKey = (gameNo: number, seq: number) => `i:${gameNo}:${String(seq).padStart(8, '0')}`;
const other = (s: RoomSeat): RoomSeat => (s === 'host' ? 'guest' : 'host');

// 設定のサニタイズ（クライアント入力を信用しない）
function sanitizeConfig(c: any): RoomConfig {
  const out: RoomConfig = { clock: { mode: 'none' }, firstTurn: 'random' };
  if (c && typeof c === 'object') {
    const m = c.clock && c.clock.mode;
    if (m === 'official30' || m === 'per' || m === 'perTurn' || m === 'none') out.clock.mode = m;
    if (out.clock.mode === 'per' || out.clock.mode === 'perTurn') {
      const pm = Number(c.clock.perMin);
      out.clock.perMin = Number.isFinite(pm) ? Math.min(120, Math.max(1, Math.round(pm))) : 30;
    }
    if (out.clock.mode === 'perTurn') {
      const tsec = Number(c.clock.turnSec);
      out.clock.turnSec = Number.isFinite(tsec) ? Math.min(600, Math.max(10, Math.round(tsec))) : 90;
    }
    if (c.firstTurn === 'host' || c.firstTurn === 'guest' || c.firstTurn === 'alt' || c.firstTurn === 'random') out.firstTurn = c.firstTurn;
  }
  return out;
}

export class MatchRoom {
  private rate = new Map<WebSocket, { t: number; n: number }>(); // ベストエフォート（ハイバネーションで消えてよい）

  constructor(private ctx: DurableObjectState, private env: Env) {
    // ping は DO を起こさず（課金ゼロで）応答
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  private async room(): Promise<RoomRecord | undefined> {
    const r = await this.ctx.storage.get<RoomRecord>('room');
    if (r) {
      // 旧レコード互換（フィールド追加時のハイバネーション/生存部屋対策）
      r.config = r.config ? sanitizeConfig(r.config) : { ...DEFAULT_CONFIG };
      r.vers = r.vers || { host: null, guest: null };
      r.first = r.first ?? null;
      r.startTs = r.startTs || r.startedAt || 0;
      r.resyncReq = r.resyncReq || { host: false, guest: false };
      r.connLost = r.connLost || { host: null, guest: null };
      r.results = r.results || { host: null, guest: null };
      r.resultSaved = !!r.resultSaved;
    }
    return r;
  }
  private async putRoom(r: RoomRecord): Promise<void> {
    await this.ctx.storage.put('room', r);
  }

  private players(r: RoomRecord): PlayerInfo[] {
    const connected = (seat: RoomSeat) => this.ctx.getWebSockets(seat).length > 0;
    const list: PlayerInfo[] = [{ seat: 'host', name: r.hostName, ready: r.ready.host, connected: connected('host') }];
    if (r.guestUid != null) list.push({ seat: 'guest', name: r.guestName || '', ready: r.ready.guest, connected: connected('guest') });
    return list;
  }

  private send(ws: WebSocket, m: S2C): void {
    try { ws.send(JSON.stringify(m)); } catch { /* closed */ }
  }
  private broadcast(m: S2C): void {
    const s = JSON.stringify(m);
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(s); } catch { /* ignore */ } }
  }
  private broadcastPeer(r: RoomRecord): void {
    this.broadcast({ t: 'peer', players: this.players(r), ts: Date.now() });
  }

  // ---- HTTP: /init（Worker からの部屋作成） / /ws（アップグレード） / /dump（デバッグ回収） ----
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // desync デバッグ回収: 両席が預けた正準状態を返す
    if (url.pathname === '/dump' && req.method === 'GET') {
      const r = await this.room();
      if (!r) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      const host = await this.ctx.storage.get('dump:host');
      const guest = await this.ctx.storage.get('dump:guest');
      return new Response(JSON.stringify({ code: r.code, desynced: r.desynced, gameNo: r.gameNo, seed: r.seed, host: host || null, guest: guest || null }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    if (url.pathname === '/init' && req.method === 'POST') {
      const body = (await req.json()) as { code: string; hostUid: string | number; hostName: string };
      const existing = await this.room();
      if (existing && existing.status !== 'ended') return new Response('taken', { status: 409 });
      const now = Date.now();
      const r: RoomRecord = {
        code: body.code, status: 'lobby',
        hostUid: String(body.hostUid), hostName: body.hostName || 'ホスト',
        guestUid: null, guestName: null,
        ready: { host: false, guest: false },
        decks: { host: null, guest: null },
        vers: { host: null, guest: null },
        config: { ...DEFAULT_CONFIG },
        first: null,
        rematch: { host: false, guest: false },
        gameNo: 0, seed: 0, nextSeq: 1, startTs: 0,
        hashes: { host: null, guest: null }, desynced: false,
        resyncReq: { host: false, guest: false },
        connLost: { host: null, guest: null },
        results: { host: null, guest: null }, resultSaved: false,
        createdAt: now, startedAt: 0, lastActivity: now,
      };
      // 前局の入力が残っていれば掃除してから初期化
      if (existing) await this.ctx.storage.deleteAll();
      await this.putRoom(r);
      await this.ctx.storage.setAlarm(now + LOBBY_TTL_MS);
      return new Response('ok');
    }

    if (url.pathname.endsWith('/ws')) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const r = await this.room();
      const uid = req.headers.get('X-Auth-Uid') || '';
      const name = req.headers.get('X-Auth-Name') || 'プレイヤー';
      const pair = new WebSocketPair();
      const client = pair[0], server = pair[1];

      const refuse = (code: S2C & { t: 'error' }): Response => {
        this.ctx.acceptWebSocket(server); // 一旦受けてエラーを届けてから閉じる
        this.send(server, code);
        server.close(4001, code.code);
        return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'opcg' } });
      };

      if (!r || r.status === 'ended') return refuse({ t: 'error', code: 'not_found' });

      // 座席決定: uid=ホスト→host / ゲスト未定 or 同一uid→guest / それ以外→満室
      let seat: RoomSeat;
      if (uid === r.hostUid) seat = 'host';
      else if (r.guestUid == null || uid === r.guestUid) seat = 'guest';
      else return refuse({ t: 'error', code: 'room_full' });

      if (seat === 'guest' && r.guestUid == null) {
        r.guestUid = uid; r.guestName = name;
      }
      r.connLost[seat] = null;
      await this.putRoom(r);

      // 同席の旧接続は新接続を優先して閉じる（リロード/複数タブ）
      for (const old of this.ctx.getWebSockets(seat)) { try { old.close(4000, 'superseded'); } catch { /* ignore */ } }

      this.ctx.acceptWebSocket(server, [seat]);
      server.serializeAttachment({ seat, uid, name } satisfies Attachment);

      this.send(server, { t: 'joined', seat, code: r.code, players: this.players(r), status: r.status, gameNo: r.gameNo, config: r.config });
      // 対戦中の再入室（ページ再読込）: seed/デッキ/入力ログを渡してクライアント側でリプレイ復元
      if (r.status === 'playing') {
        const after = Number(url.searchParams.get('after') ?? -1);
        const sameGame = Number(url.searchParams.get('game') ?? -1) === r.gameNo;
        const from = sameGame && after >= 0 ? after : 0;
        const inputs = await this.listInputs(r.gameNo, from);
        this.send(server, {
          t: 'welcome', gameNo: r.gameNo, seed: r.seed,
          decks: { host: r.decks.host!, guest: r.decks.guest! },
          names: { host: r.hostName, guest: r.guestName || '' },
          inputs, lastSeq: r.nextSeq - 1, status: r.status,
          config: r.config, first: r.first, ts: Date.now(), startTs: r.startTs,
        });
      }
      this.broadcastPeer(r);
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'opcg' } });
    }

    return new Response('not found', { status: 404 });
  }

  private async listInputs(gameNo: number, afterSeq: number): Promise<SeqInput[]> {
    const map = await this.ctx.storage.list<SeqInput>({
      prefix: `i:${gameNo}:`,
      startAfter: afterSeq >= 1 ? inKey(gameNo, afterSeq) : undefined,
    });
    return [...map.values()];
  }

  // ---- WebSocket メッセージ ----
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    // 簡易レート制限（1秒あたり）
    const now = Date.now();
    const rl = this.rate.get(ws) || { t: now, n: 0 };
    if (now - rl.t > 1000) { rl.t = now; rl.n = 0; }
    rl.n++; this.rate.set(ws, rl);
    if (rl.n > RATE_LIMIT_PER_SEC) { this.send(ws, { t: 'error', code: 'rate' }); return; }

    let msg: C2S;
    try { msg = JSON.parse(raw) as C2S; } catch { return; }
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    const r = await this.room();
    if (!r) { this.send(ws, { t: 'error', code: 'not_found' }); return; }
    const seat: RoomSeat = att.seat;

    switch (msg.t) {
      case 'config': {
        if (r.status !== 'lobby' || seat !== 'host') return; // 設定はロビー中のホストのみ
        r.config = sanitizeConfig(msg.config);
        r.lastActivity = now;
        await this.putRoom(r);
        this.broadcast({ t: 'config', config: r.config });
        return;
      }
      case 'ready': {
        if (r.status !== 'lobby') { this.send(ws, { t: 'error', code: 'bad_state' }); return; }
        const d = msg.deck;
        if (!d || typeof d.leader !== 'string' || !d.list || typeof d.list !== 'object') return;
        r.decks[seat] = { leader: d.leader, list: d.list, name: String(d.name || 'デッキ') };
        r.vers[seat] = typeof msg.ver === 'string' ? msg.ver.slice(0, 40) : null;
        r.ready[seat] = true;
        r.lastActivity = now;
        if (r.ready.host && r.ready.guest && r.guestUid != null) {
          // ★版数照合: ロックステップは同一ビルド前提。不一致なら開始せず両者のreadyを解除
          if (r.vers.host && r.vers.guest && r.vers.host !== r.vers.guest) {
            r.ready.host = false; r.ready.guest = false;
            await this.putRoom(r);
            this.broadcast({ t: 'version-mismatch', vers: { host: r.vers.host, guest: r.vers.guest } });
            this.broadcastPeer(r);
            return;
          }
          await this.startGame(r);
        } else {
          await this.putRoom(r);
          this.broadcastPeer(r);
        }
        return;
      }
      case 'unready': {
        if (r.status !== 'lobby') return;
        r.ready[seat] = false;
        await this.putRoom(r);
        this.broadcastPeer(r);
        return;
      }
      case 'input': {
        if (r.status !== 'playing' || r.desynced) return;
        const seq = r.nextSeq++;
        r.lastActivity = now;
        const rec: SeqInput = { seq, seat, d: msg.d as GameInput, ts: now };
        await this.ctx.storage.put({ room: r, [inKey(r.gameNo, seq)]: rec });
        this.broadcast({ t: 'input', seq, seat, d: rec.d, ts: now });
        return;
      }
      case 'hash': {
        if (r.status !== 'playing' || r.desynced) return;
        r.hashes[seat] = { n: msg.n, h: msg.h };
        const a = r.hashes.host, b = r.hashes.guest;
        if (a && b && a.n === b.n && a.h !== b.h) {
          r.desynced = true;
          r.resyncReq = { host: false, guest: false };
          await this.putRoom(r);
          this.broadcast({ t: 'desync', n: msg.n });
          return;
        }
        await this.putRoom(r);
        return;
      }
      case 'resync': {
        // desync自動復旧: クライアントが「サーバの入力ログから再構築完了」を申告。
        // 両者揃ったら hash 台帳をリセットして続行を許可する。
        if (r.status !== 'playing' || !r.desynced) return;
        r.resyncReq[seat] = true;
        if (r.resyncReq.host && r.resyncReq.guest) {
          r.desynced = false;
          r.hashes = { host: null, guest: null };
          r.resyncReq = { host: false, guest: false };
          await this.putRoom(r);
          this.broadcast({ t: 'resync-go', lastSeq: r.nextSeq - 1 });
        } else {
          await this.putRoom(r);
        }
        return;
      }
      case 'dump': {
        // desync デバッグ: クライアントが預ける境界時点の正準状態（GET /rooms/:code/dump で回収）
        if (typeof msg.state !== 'string' || msg.state.length > 120000) return;
        await this.ctx.storage.put(`dump:${seat}`, { n: msg.n, at: now, state: msg.state });
        return;
      }
      case 'claim': {
        // 相手切断の裁定: 切断が猶予を超えていれば、切断側の投了を DO が代理発行する
        if (r.status !== 'playing' || msg.reason !== 'disconnect') { this.send(ws, { t: 'error', code: 'claim_rejected' }); return; }
        const opp = other(seat);
        const oppConnected = this.ctx.getWebSockets(opp).length > 0;
        const lostAt = r.connLost[opp];
        const grace = Number(this.env.CLAIM_GRACE_MS) || CLAIM_GRACE_MS; // テストは --var で短縮可
        if (oppConnected || lostAt == null || now - lostAt < grace) {
          this.send(ws, { t: 'error', code: 'claim_rejected' });
          return;
        }
        const seq = r.nextSeq++;
        r.lastActivity = now;
        const rec: SeqInput = { seq, seat: opp, d: { t: 'forfeit', reason: '切断' }, ts: now };
        await this.ctx.storage.put({ room: r, [inKey(r.gameNo, seq)]: rec });
        this.broadcast({ t: 'input', seq, seat: opp, d: rec.d, ts: now });
        return;
      }
      case 'emote': {
        if (r.status === 'ended') return;
        const k = Number(msg.k);
        if (!Number.isInteger(k) || k < 0 || k >= EMOTES.length) return;
        this.broadcast({ t: 'emote', seat, k });
        return;
      }
      case 'result': {
        // 終局申告。両席の申告が一致したら戦績＋リプレイを D1 へ記録（1ゲーム1回）。
        if (r.status !== 'playing' || r.resultSaved) return;
        const res = msg.result;
        if (!res || (res.winner !== 'host' && res.winner !== 'guest' && res.winner !== 'draw')) return;
        r.results[seat] = { winner: res.winner, reason: String(res.reason || '').slice(0, 60), turns: Number(res.turns) | 0 };
        const a = r.results.host, b = r.results.guest;
        if (a && b) {
          if (a.winner === b.winner) {
            r.resultSaved = true;
            await this.putRoom(r);
            const id = await this.saveMatch(r, a);
            this.broadcast({ t: 'result-saved', id });
          } else {
            await this.putRoom(r); // 不一致＝desync系。hash側が検知する
          }
        } else {
          await this.putRoom(r);
        }
        return;
      }
      case 'resume': {
        if (r.status !== 'playing') return;
        const inputs = await this.listInputs(r.gameNo, Math.max(0, msg.afterSeq));
        for (const rec of inputs) this.send(ws, { t: 'input', seq: rec.seq, seat: rec.seat, d: rec.d, ts: rec.ts || 0 });
        return;
      }
      case 'rematch': {
        if (r.status !== 'playing' || r.guestUid == null) return;
        r.rematch[seat] = true;
        if (r.rematch.host && r.rematch.guest) {
          await this.startGame(r);
        } else {
          await this.putRoom(r);
          this.broadcast({ t: 'rematch-wait', by: seat });
        }
        return;
      }
      case 'leave': {
        try { ws.close(4002, 'left'); } catch { /* ignore */ }
        if (r.status === 'lobby' && seat === 'guest') {
          r.guestUid = null; r.guestName = null; r.ready.guest = false; r.vers.guest = null;
          await this.putRoom(r);
        }
        this.broadcastPeer(r);
        return;
      }
    }
  }

  // 新規ゲーム開始（初回 ready 完了 / リマッチ）。seed 生成・カウンタ初期化・start 配信。
  private async startGame(r: RoomRecord): Promise<void> {
    const now = Date.now();
    // 旧ゲームの入力ログを掃除（リマッチ時。ストレージ肥大防止）
    if (r.gameNo > 0) {
      const old = await this.ctx.storage.list({ prefix: `i:${r.gameNo}:` });
      if (old.size) await this.ctx.storage.delete([...old.keys()]);
    }
    r.gameNo++;
    r.seed = new DataView(crypto.getRandomValues(new Uint8Array(4)).buffer).getUint32(0) >>> 0 || 1;
    r.nextSeq = 1;
    r.status = 'playing';
    r.hashes = { host: null, guest: null };
    r.desynced = false;
    r.resyncReq = { host: false, guest: false };
    r.results = { host: null, guest: null };
    r.resultSaved = false;
    r.rematch = { host: false, guest: false };
    r.startedAt = now;
    r.startTs = now;
    r.lastActivity = now;
    // 先攻: random=null（クライアントがseedのrngで決定）/ host / guest / alt=交互（奇数ゲーム=host）
    r.first = r.config.firstTurn === 'host' ? 'host'
      : r.config.firstTurn === 'guest' ? 'guest'
      : r.config.firstTurn === 'alt' ? (r.gameNo % 2 === 1 ? 'host' : 'guest')
      : null;
    await this.putRoom(r);
    await this.ctx.storage.setAlarm(now + Math.min(IDLE_TTL_MS, HARD_TTL_MS));
    this.broadcast({
      t: 'start', gameNo: r.gameNo, seed: r.seed,
      decks: { host: r.decks.host!, guest: r.decks.guest! },
      names: { host: r.hostName, guest: r.guestName || '' },
      firstSeq: 1, config: r.config, first: r.first, ts: now,
    });
  }

  // 戦績＋リプレイを D1 へ記録（バインド未設定/失敗は握りつぶす＝対戦継続を優先）
  private async saveMatch(r: RoomRecord, res: MatchResult): Promise<number | null> {
    if (!this.env.DB) return null;
    try {
      const inputs = await this.listInputs(r.gameNo, 0);
      const replay = JSON.stringify({
        seed: r.seed,
        decks: { host: r.decks.host, guest: r.decks.guest },
        names: { host: r.hostName, guest: r.guestName || '' },
        first: r.first,
        config: r.config,
        inputs,
      });
      if (replay.length > 900000) return null; // D1の行サイズ安全域
      await this.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, game_no INTEGER NOT NULL,
          host_uid INTEGER NOT NULL, guest_uid INTEGER NOT NULL, host_name TEXT NOT NULL, guest_name TEXT NOT NULL,
          host_leader TEXT NOT NULL, guest_leader TEXT NOT NULL, winner TEXT NOT NULL, reason TEXT, turns INTEGER,
          seed INTEGER NOT NULL, replay TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
      ).run();
      const out = await this.env.DB.prepare(
        `INSERT INTO matches (code, game_no, host_uid, guest_uid, host_name, guest_name, host_leader, guest_leader, winner, reason, turns, seed, replay)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        r.code, r.gameNo, Number(r.hostUid) || 0, Number(r.guestUid) || 0, r.hostName, r.guestName || '',
        r.decks.host?.leader || '', r.decks.guest?.leader || '', res.winner, res.reason || null, res.turns || null,
        r.seed, replay,
      ).run();
      const id = (out.meta as any)?.last_row_id;
      return typeof id === 'number' ? id : null;
    } catch (e) {
      console.warn('saveMatch failed', e);
      return null;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.rate.delete(ws);
    // ★閉じつつあるソケット自身が getWebSockets() にまだ含まれることがあるため、自分を除外して判定する
    const tags = this.ctx.getTags(ws);
    const seat = (tags && tags[0]) as RoomSeat | undefined;
    const r = await this.room();
    if (!r) return;
    if (seat && this.ctx.getWebSockets(seat).filter((s) => s !== ws).length === 0 && r.connLost[seat] == null) {
      r.connLost[seat] = Date.now(); // 席の全ソケットが落ちた時刻（claim検証・クロック表示用）
      await this.putRoom(r);
    }
    this.broadcastPeer(r);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(1011, 'error'); } catch { /* ignore */ }
  }

  // TTL 掃除。期限内なら再アーム。
  async alarm(): Promise<void> {
    const r = await this.room();
    if (!r) { await this.ctx.storage.deleteAll(); return; }
    const now = Date.now();
    const expired =
      (r.status === 'lobby' && now - r.createdAt > LOBBY_TTL_MS) ||
      (r.status === 'playing' && (now - r.lastActivity > IDLE_TTL_MS || now - r.startedAt > HARD_TTL_MS)) ||
      r.status === 'ended';
    if (expired) {
      this.broadcast({ t: 'bye', reason: 'ttl' });
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(4003, 'ttl'); } catch { /* ignore */ } }
      await this.ctx.storage.deleteAll(); // alarm も消える
      return;
    }
    await this.ctx.storage.setAlarm(now + 10 * 60 * 1000); // 10分後に再チェック
  }
}

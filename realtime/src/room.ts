// MatchRoom Durable Object — 1部屋=1インスタンス（idFromName(部屋コード)）。
// 役割は「対戦入力(input)の全順序付け（seq採番）・記録・全員への中継」のみで、
// ゲームロジック（OPCGエンジン）は一切持たない（ロックステップはクライアント側で成立）。
//
// - WebSocket Hibernation（ctx.acceptWebSocket）: アイドル中は課金ゼロ。ping/pong は
//   setWebSocketAutoResponse で DO を起こさず応答。
// - 状態は毎メッセージ storage(SQLiteバックエンド) に永続化し、ハイバネーション復帰に備える。
// - hash: 各クライアントがターン境界で送る状態ハッシュを突合し、不一致なら desync を配信。
// - TTL: alarm で放置部屋を掃除（未start 30分 / アクティビティ停止 2時間 / 開始から 6時間）。
import type { GameInput, DeckPayload, PlayerInfo, RoomSeat, RoomStatus, C2S, S2C, SeqInput } from '../../src/net/protocol';

interface RoomRecord {
  code: string;
  status: RoomStatus;
  hostUid: string;
  hostName: string;
  guestUid: string | null;
  guestName: string | null;
  ready: { host: boolean; guest: boolean };
  decks: { host: DeckPayload | null; guest: DeckPayload | null };
  rematch: { host: boolean; guest: boolean };
  gameNo: number;
  seed: number;
  nextSeq: number;
  hashes: { host: { n: number; h: string } | null; guest: { n: number; h: string } | null };
  desynced: boolean;
  createdAt: number;
  startedAt: number;
  lastActivity: number;
}

interface Attachment { seat: RoomSeat; uid: string; name: string }

const LOBBY_TTL_MS = 30 * 60 * 1000;      // 未start の部屋
const IDLE_TTL_MS = 2 * 60 * 60 * 1000;   // 入力が止まってから
const HARD_TTL_MS = 6 * 60 * 60 * 1000;   // start からの上限
const RATE_LIMIT_PER_SEC = 20;            // ソケットごとの受信メッセージ上限

const inKey = (gameNo: number, seq: number) => `i:${gameNo}:${String(seq).padStart(8, '0')}`;

export class MatchRoom {
  private rate = new Map<WebSocket, { t: number; n: number }>(); // ベストエフォート（ハイバネーションで消えてよい）

  constructor(private ctx: DurableObjectState, private env: unknown) {
    // ping は DO を起こさず（課金ゼロで）応答
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  private async room(): Promise<RoomRecord | undefined> {
    return this.ctx.storage.get<RoomRecord>('room');
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

  // ---- HTTP: /init（Worker からの部屋作成） / /ws（アップグレード） ----
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // desync デバッグ回収: 両席が預けた正準状態を返す（部屋がdesync済みの時のみ）
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
        rematch: { host: false, guest: false },
        gameNo: 0, seed: 0, nextSeq: 1,
        hashes: { host: null, guest: null }, desynced: false,
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
        await this.putRoom(r);
      }

      // 同席の旧接続は新接続を優先して閉じる（リロード/複数タブ）
      for (const old of this.ctx.getWebSockets(seat)) { try { old.close(4000, 'superseded'); } catch { /* ignore */ } }

      this.ctx.acceptWebSocket(server, [seat]);
      server.serializeAttachment({ seat, uid, name } satisfies Attachment);

      this.send(server, { t: 'joined', seat, code: r.code, players: this.players(r), status: r.status, gameNo: r.gameNo });
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
        });
      }
      this.broadcast({ t: 'peer', players: this.players(r) });
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
      case 'ready': {
        if (r.status !== 'lobby') { this.send(ws, { t: 'error', code: 'bad_state' }); return; }
        const d = msg.deck;
        if (!d || typeof d.leader !== 'string' || !d.list || typeof d.list !== 'object') return;
        r.decks[seat] = { leader: d.leader, list: d.list, name: String(d.name || 'デッキ') };
        r.ready[seat] = true;
        r.lastActivity = now;
        if (r.ready.host && r.ready.guest && r.guestUid != null) {
          await this.startGame(r);
        } else {
          await this.putRoom(r);
          this.broadcast({ t: 'peer', players: this.players(r) });
        }
        return;
      }
      case 'unready': {
        if (r.status !== 'lobby') return;
        r.ready[seat] = false;
        await this.putRoom(r);
        this.broadcast({ t: 'peer', players: this.players(r) });
        return;
      }
      case 'input': {
        if (r.status !== 'playing' || r.desynced) return;
        const seq = r.nextSeq++;
        r.lastActivity = now;
        const rec: SeqInput = { seq, seat, d: msg.d as GameInput };
        await this.ctx.storage.put({ room: r, [inKey(r.gameNo, seq)]: rec });
        this.broadcast({ t: 'input', seq, seat, d: rec.d });
        return;
      }
      case 'hash': {
        if (r.status !== 'playing' || r.desynced) return;
        r.hashes[seat] = { n: msg.n, h: msg.h };
        const a = r.hashes.host, b = r.hashes.guest;
        if (a && b && a.n === b.n && a.h !== b.h) {
          r.desynced = true;
          await this.putRoom(r);
          this.broadcast({ t: 'desync', n: msg.n });
          return;
        }
        await this.putRoom(r);
        return;
      }
      case 'dump': {
        // desync デバッグ: クライアントが預ける境界時点の正準状態（GET /rooms/:code/dump で回収）
        if (typeof msg.state !== 'string' || msg.state.length > 120000) return;
        await this.ctx.storage.put(`dump:${seat}`, { n: msg.n, at: now, state: msg.state });
        return;
      }
      case 'resume': {
        if (r.status !== 'playing') return;
        const inputs = await this.listInputs(r.gameNo, Math.max(0, msg.afterSeq));
        for (const rec of inputs) this.send(ws, { t: 'input', seq: rec.seq, seat: rec.seat, d: rec.d });
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
          r.guestUid = null; r.guestName = null; r.ready.guest = false;
          await this.putRoom(r);
        }
        this.broadcast({ t: 'peer', players: this.players(r) });
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
    r.rematch = { host: false, guest: false };
    r.startedAt = now;
    r.lastActivity = now;
    await this.putRoom(r);
    await this.ctx.storage.setAlarm(now + Math.min(IDLE_TTL_MS, HARD_TTL_MS));
    this.broadcast({
      t: 'start', gameNo: r.gameNo, seed: r.seed,
      decks: { host: r.decks.host!, guest: r.decks.guest! },
      names: { host: r.hostName, guest: r.guestName || '' },
      firstSeq: 1,
    });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.rate.delete(ws);
    const r = await this.room();
    if (r) this.broadcast({ t: 'peer', players: this.players(r) });
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

// 戦績リプレイ（D1 matches.replay の JSON）をヘッドレス再生し、解析用ダンプを出力するツール。
// 「ユーザーのプレイ観察 → heuristic 修正」（engine/CLAUDE.md §8 の残レバー）の一次データを作る。
//   使い方: npx vite-node scripts/replay-dump.ts <replay.json>... （出力は <入力名>.dump.json）
// 再生は本番の復帰リプレイと同経路（受信専用 createLockstep + G._sim）＝ tests/lockstep.test.ts の C クライアントと同型。
import fs from 'node:fs';
import path from 'node:path';
import { makeClient } from '../tests/_lockstep-helpers';
import { seatOf, type SeqInput, type RoomSeat, type DeckPayload } from '../src/net/protocol';

interface ReplayJson {
  seed: number;
  decks: Record<RoomSeat, DeckPayload>;
  names: Record<RoomSeat, string>;
  first: RoomSeat | null;
  inputs: SeqInput[];
}

// 演出待ちを即時化（lockstep.test.ts と同方針。dispatch の実タイマーは module 読込時に確保済み）
(globalThis as any).setTimeout = (cb: any) => { (globalThis as any).setImmediate(cb); return 0 as any; };
const tick = () => new Promise<void>((r) => (globalThis as any).setImmediate(r));
const stripTags = (s: string) => String(s).replace(/<[^>]*>/g, '');

async function dumpReplay(file: string): Promise<void> {
  const d = JSON.parse(fs.readFileSync(file, 'utf8')) as ReplayJson;
  const c = makeClient('me', null); // 受信専用（送信しない）
  const eng: any = c.engine;
  const G: any = eng.G;
  // reactAdapter は log/flog を store.pushLog へ流す（G.log には積まれない）＝ここで捕捉する
  const gameLog: Array<{ cls: string; html: string }> = [];
  c.store.pushLog = (l: { cls: string; html: string }) => gameLog.push(l);

  // src/net/replay.ts の bootReplayEngine と同手順でデッキ登録・シード・開始
  G.names = { me: d.names.host || 'ホスト', cpu: d.names.guest || 'ゲスト' };
  const reg = (p: DeckPayload, id: string) => eng.builderToDeck({ leaderNo: p.leader, list: p.list, name: p.name }, id);
  G.customDecks = [reg(d.decks.host, 'net-host'), reg(d.decks.guest, 'net-guest')];
  G.aiOn = false;
  G.firstPref = d.first == null ? 'random' : d.first === 'host' ? 'me' : 'cpu';
  eng.seedRng(d.seed);
  void eng.startGame('net-host', 'net-guest', { cpuHuman: true });
  if (!process.env.NOSIM) G._sim = true;

  const cardOf = (uid: any) => {
    const x = eng.findCard ? eng.findCard(uid) : null;
    return x ? { no: x.no, name: x.base?.name } : null;
  };
  // プロンプト応答値のカード解決（'pick:<uid>' / uid配列など既存エンジン語彙）
  const resolveV = (v: any): any => {
    if (typeof v === 'string' && v.startsWith('pick:')) return { pick: cardOf(Number(v.slice(5))) || v };
    if (Array.isArray(v)) return v.map(resolveV);
    if (typeof v === 'number') { const x = cardOf(v); return x ? { pick: x } : v; }
    return v;
  };

  // 盤面スナップショット（ターン境界＝endTurn適用後・次入力適用直前の停泊状態）
  const snaps: any[] = [];
  const sideSnap = (s: 'me' | 'cpu') => {
    const P = G.players[s];
    const att = (P.chars || []).reduce((a: number, x: any) => a + (x.attachedDon || 0), 0) + (P.leader.attachedDon || 0);
    return {
      don: { active: P.don.active, rested: P.don.rested, attached: att, max: P.donMax },
      life: P.life.length, deck: P.deck.length, trash: P.trash.length,
      hand: P.hand.map((x: any) => x.no),
      leader: { no: P.leader.no, rested: !!P.leader.rested, don: P.leader.attachedDon || 0 },
      stage: P.stage ? P.stage.no : null,
      chars: (P.chars || []).map((x: any) => ({
        no: x.no, name: x.base?.name, cost: x.base?.cost, pow: (() => { try { return eng.power(x); } catch { return x.base?.power; } })(),
        rested: !!x.rested, don: x.attachedDon || 0,
      })),
    };
  };
  const snap = (label: string) => snaps.push({
    label, turnSeq: G.turnSeq, active: G.active, logLen: gameLog.length,
    host: sideSnap('me'), guest: sideSnap('cpu'),
  });
  c.driver.setOnBoundary((n: number) => snap(`boundary${n}`));

  // 入力の適用タイムライン（適用時点で uid をカード名に解決・ログ位置と対応付け）
  const applied: any[] = [];
  let prevTs = 0;
  const tsBySeq = new Map<number, number>();
  for (const rec of d.inputs) tsBySeq.set(rec.seq, rec.ts || 0);
  c.driver.setOnApplied((seat: any, din: any) => {
    const ts = tsBySeq.get(applied.length + 1) || 0;
    const e: any = { i: applied.length + 1, seat, t: din.t, turnSeq: G.turnSeq, logLen: gameLog.length };
    if (ts && prevTs) e.thinkMs = ts - prevTs;
    if (ts) prevTs = ts;
    if (din.t === 'play' || din.t === 'menu') e.card = cardOf(din.uid);
    if (din.t === 'attack') { e.attacker = cardOf(din.auid); e.target = cardOf(din.tuid); }
    if (din.t === 'prompt') e.v = resolveV(din.v);
    applied.push(e);
  });

  // DEBUG: attackSel の set/clear と busy 遷移をトレース（stall 解析用）
  const trace: string[] = [];
  if (process.env.DEBUG_STALL) {
    let _sel: any = G.attackSel, _busy: any = G.busy;
    Object.defineProperty(G, 'attackSel', {
      get: () => _sel,
      set: (v) => { trace.push(`[in#${applied.length}] attackSel=${v ? 'SET(' + (v.attacker?.base?.name || '?') + ')' : 'null'}`); _sel = v; },
    });
    Object.defineProperty(G, 'busy', {
      get: () => _busy,
      set: (v) => { if (v !== _busy) trace.push(`[in#${applied.length}] busy=${v}`); _busy = v; },
    });
  }

  // 全入力を投入 → pump で消化（本番の復帰リプレイと同じ）
  for (const rec of d.inputs) c.driver.onRemoteInput(rec.seq, seatOf(rec.seat), rec.d);
  const lastSeq = d.inputs.length ? d.inputs[d.inputs.length - 1].seq : 0;
  let iter = 0;
  while (c.driver.nextSeq() <= lastSeq && iter < 300000) {
    await tick();
    iter++;
    c.driver.pump();
  }
  for (let i = 0; i < 60; i++) await tick();
  snap('final');
  if (process.env.DEBUG_STALL && c.driver.nextSeq() <= lastSeq) {
    const head = d.inputs.find((r) => r.seq === c.driver.nextSeq());
    console.log('[stall診断]', JSON.stringify({
      nextSeq: c.driver.nextSeq(), head: head && { seat: head.seat, d: head.d },
      busy: G.busy, myActable: G.myActable, active: G.active,
      promptState: !!G.promptState, pendingChoice: !!G.pendingChoice, attackSel: !!G.attackSel,
      storePrompt: c.store.prompt && { id: c.store.prompt.id, side: c.store.prompt.side, local: c.store.prompt.local, title: c.store.prompt.title, cls: c.store.prompt.cls, opts: (c.store.prompt.opts || []).map((o: any) => o.v) },
      winner: G.winner, phase: G.phase,
    }));
    console.log('[trace] 末尾40件:\n' + trace.slice(-40).join('\n'));
  }

  const out = {
    file: path.basename(file),
    seed: d.seed, first: d.first, names: d.names,
    decks: d.decks,
    winner: G.winner, turnSeq: G.turnSeq, desynced: c.isDesynced(), consumed: c.driver.nextSeq() - 1, totalInputs: lastSeq,
    snapshots: snaps,
    timeline: applied,
    log: gameLog.map((l: any, i: number) => ({ i, cls: l.cls, text: stripTags(l.html) })),
  };
  const outPath = file.replace(/\.json$/, '') + '.dump.json';
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`${path.basename(file)}: winner=${G.winner} turnSeq=${G.turnSeq} inputs=${out.consumed}/${lastSeq} desync=${out.desynced} log=${out.log.length}行 → ${outPath}`);
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: npx vite-node scripts/replay-dump.ts <replay.json>...'); process.exit(1); }
for (const f of files) await dumpReplay(f);
process.exit(0);

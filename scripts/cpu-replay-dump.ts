// CPU戦リプレイ（D1 cpu_matches.replay の JSON）をヘッドレス再生し、解析用ダンプを出力するツール。
// オンライン用 scripts/replay-dump.ts の姉妹版。決定的再現の前提（src/net/cpuRecorder.ts 冒頭コメント）:
//  - 記録は人間入力（seat='host'）のみ。CPUの手は「同一コミット（replay.cpu.ver の worktree で実行）＋
//    同一シード」でエンジンが再計算する（puct は sims 回数制限・Math.random 不使用・aiOn=false）
//  - DeckSelect.start() と同一のブート順序を再現する: cpuMode/aiOn/_puctCap/firstPref 設定 →
//    seedRng(seed) → startGame(deckIds) → started 解決後に players.cpu.agent='puct'
//    （agent はマリガン中は startGame 既定のまま＝この順序を崩すとCPUマリガンからズレる）
//  - デッキは「元の定義順」が必須（buildPlayer の展開順→uid採番→シャッフルが変わるため、
//    replay.decks のゾーン走査スナップショットでは代用不可）。プリセットIDはエンジン内で解決・
//    カスタム/共有IDは OPCG_DECKS_FILE（D1 decks の {id:{leader,list,name}} マップ）から注入する。
//  - 検証: 開始直後の全ゾーン走査を replay.decks と多重集合比較（不一致＝デッキが対戦後に編集された）
//  - G._sim は立てない（CPUに実際に思考させる）。誤終局記録バグ（2026-08-07修正）以前の行は
//    inputs が途中で切れている＝入力枯渇後は「CPUが人間入力待ちで停泊」した時点で打ち切り truncated=true
// 使い方: OPCG_DECKS_FILE=decks-map.json npx vite-node scripts/cpu-replay-dump.ts <r*.json>...
//         （r*.json は cpu_matches 行の {id?, seed?, replay} または replay 単体。出力は <入力名>.dump.json）
import fs from 'node:fs';
import path from 'node:path';
import { makeClient } from '../tests/_lockstep-helpers';
import { seatOf, type SeqInput, type RoomSeat, type DeckPayload } from '../src/net/protocol';

interface CpuReplayJson {
  seed: number;
  decks: Record<RoomSeat, DeckPayload>;
  names: Record<RoomSeat, string>;
  first: RoomSeat | null;
  inputs: SeqInput[];
  cpu?: { agent?: string; cpuMode?: string; aiOn?: boolean; puctCap?: any; firstPref?: string; deckIds?: { me: string; cpu: string }; ver?: string };
}

// 演出待ちを即時化（replay-dump.ts と同方針。dispatch の実タイマーは module 読込時に確保済み）
(globalThis as any).setTimeout = (cb: any) => { (globalThis as any).setImmediate(cb); return 0 as any; };
const tick = () => new Promise<void>((r) => (globalThis as any).setImmediate(r));
const stripTags = (s: string) => String(s).replace(/<[^>]*>/g, '');

const DECKS_MAP: Record<string, { leader: string; list: Record<string, number>; name?: string }> =
  process.env.OPCG_DECKS_FILE ? JSON.parse(fs.readFileSync(process.env.OPCG_DECKS_FILE, 'utf8')) : {};

// 盤面の全ゾーンを歩いてデッキ多重集合を復元（cpuRecorder.snapshotDeck と同じ走査）
function zoneMultiset(G: any, side: 'me' | 'cpu'): Record<string, number> {
  const P = G.players[side];
  const list: Record<string, number> = {};
  const zones: any[] = [P.deck || [], P.hand || [], P.life || [], P.trash || [], P.chars || []];
  if (P.stage) zones.push([P.stage]);
  for (const z of zones) for (const c of z) { if (c && c.no) list[c.no] = (list[c.no] || 0) + 1; }
  return list;
}
function sameMultiset(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}

async function dumpCpuReplay(file: string): Promise<void> {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const d = (raw.replay ? raw.replay : raw) as CpuReplayJson;
  const rowMeta = raw.replay ? { id: raw.id, winner: raw.winner, turns: raw.turns, ver: raw.ver } : {};
  const c = makeClient('me', null); // 受信専用（送信しない）
  const eng: any = c.engine;
  const G: any = eng.G;
  const gameLog: Array<{ cls: string; html: string }> = [];
  // ★!G._sim フィルタ: CPU探索ロールアウト中のログを除外（2026-08-07 以前のビルドは adapter 側に
  //   sim ガードが無く、素通しだと1試合4000行超のロールアウトログが混入する）
  c.store.pushLog = (l: { cls: string; html: string }) => { if (!G._sim) gameLog.push(l); };

  // --- DeckSelect.start() と同一のブート順序 ---
  G.names = { me: d.names.host || 'あなた', cpu: d.names.guest || 'CPU' };
  G.cpuMode = d.cpu?.cpuMode || 'strong';
  G.aiOn = false;
  G.cpuStrength = 'strong';
  G._puctCap = d.cpu?.puctCap || null;
  G.firstPref = d.first == null ? 'random' : d.first === 'host' ? 'me' : 'cpu';
  const ids = d.cpu?.deckIds || { me: 'net-host', cpu: 'net-guest' };
  // カスタム/共有デッキを注入（プリセットIDはエンジンの findDeck が先に解決する）
  G.customDecks = [];
  for (const side of ['me', 'cpu'] as const) {
    const id = ids[side];
    const def = DECKS_MAP[id];
    if (def) G.customDecks.push({ id, name: def.name || id, leader: def.leader, list: def.list });
  }
  eng.seedRng(d.seed);
  let startResolved = false;
  let startErr: any = null;
  const started: Promise<any> = Promise.resolve(eng.startGame(ids.me, ids.cpu));
  // 本番同様「started 解決後」に CPU エージェントを設定（マリガン中は startGame 既定のまま）
  started.then(() => {
    if (G.players && G.players.cpu) G.players.cpu.agent = d.cpu?.agent || 'puct';
    startResolved = true;
  }).catch((e) => { startErr = e; startResolved = true; });
  await tick(); // startGame 同期部（盤面構築）を確定させる
  if (!G.players || !G.players.me) { console.error(`${path.basename(file)}: startGame失敗（デッキID未解決? ids=${JSON.stringify(ids)}）`); return; }

  // デッキ検証: 記録時のゾーン走査スナップショットと多重集合一致するか（不一致＝対戦後にデッキ編集）
  const deckOk = {
    host: sameMultiset({ ...zoneMultiset(G, 'me'), [G.players.me.leader?.no]: (zoneMultiset(G, 'me')[G.players.me.leader?.no] || 0) + 1 }, { ...d.decks.host.list, [d.decks.host.leader]: (d.decks.host.list[d.decks.host.leader] || 0) + 1 }),
    guest: sameMultiset({ ...zoneMultiset(G, 'cpu'), [G.players.cpu.leader?.no]: (zoneMultiset(G, 'cpu')[G.players.cpu.leader?.no] || 0) + 1 }, { ...d.decks.guest.list, [d.decks.guest.leader]: (d.decks.guest.list[d.decks.guest.leader] || 0) + 1 }),
  };
  if ((!deckOk.host || !deckOk.guest) && !process.env.OPCG_FORCE) {
    console.error(`${path.basename(file)}: デッキ不一致（編集/削除済み） host=${deckOk.host} guest=${deckOk.guest} — OPCG_FORCE=1 で強行可`);
    return;
  }

  const cardOf = (uid: any) => {
    const x = eng.findCard ? eng.findCard(uid) : null;
    return x ? { no: x.no, name: x.base?.name } : null;
  };
  const resolveV = (v: any): any => {
    if (typeof v === 'string' && v.startsWith('pick:')) return { pick: cardOf(Number(v.slice(5))) || v };
    if (Array.isArray(v)) return v.map(resolveV);
    if (typeof v === 'number') { const x = cardOf(v); return x ? { pick: x } : v; }
    return v;
  };

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

  // 全入力を投入 → pump（CPUの手番はエンジンが自走・人間入力は待ち状態に達したときだけ配達される）
  for (const rec of d.inputs) c.driver.onRemoteInput(rec.seq, seatOf(rec.seat), rec.d);
  const lastSeq = d.inputs.length ? d.inputs[d.inputs.length - 1].seq : 0;
  const T0 = Date.now();
  const TIME_CAP = +(process.env.OPCG_TIME_CAP_MS || 15 * 60 * 1000);
  let iter = 0;
  while (c.driver.nextSeq() <= lastSeq && iter < 5000000 && Date.now() - T0 < TIME_CAP) {
    await tick();
    iter++;
    c.driver.pump();
  }
  // 入力枯渇後: CPUの終局手（最後の人間入力の後にCPUがリーサル等）を進める。
  // 「人間の入力待ちで停泊」（active=me で actable / meのプロンプト待ち）に達したら打ち切り＝truncated。
  let stalled = false;
  let quietTicks = 0;
  while (!G.winner && iter < 5000000 && Date.now() - T0 < TIME_CAP) {
    await tick();
    iter++;
    const waitingHuman = (() => {
      const p = c.store.prompt;
      if (p && !p.local && ((p.side || 'me') === 'me')) return true;
      if (G.attackSel && G.active === 'me') return true;
      return G.active === 'me' && G.myActable && !G.busy && !G.promptState && !G.pendingChoice && startResolved;
    })();
    if (waitingHuman) { quietTicks++; if (quietTicks > 200) { stalled = true; break; } }
    else quietTicks = 0;
  }
  snap('final');

  const out = {
    file: path.basename(file),
    row: rowMeta,
    seed: d.seed, first: d.first, names: d.names, cpu: d.cpu || null,
    decks: d.decks, deckOk,
    winner: G.winner, turnSeq: G.turnSeq, desynced: c.isDesynced(),
    consumed: c.driver.nextSeq() - 1, totalInputs: lastSeq,
    truncated: stalled || (!G.winner && c.driver.nextSeq() <= lastSeq),
    startErr: startErr ? String(startErr) : null,
    snapshots: snaps,
    timeline: applied,
    log: gameLog.map((l: any, i: number) => ({ i, cls: l.cls, text: stripTags(l.html) })),
  };
  const outPath = file.replace(/\.json$/, '') + '.dump.json';
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(`${path.basename(file)}: winner=${G.winner} turnSeq=${G.turnSeq} inputs=${out.consumed}/${lastSeq} truncated=${out.truncated} desync=${out.desynced} deckOk=${deckOk.host}/${deckOk.guest} log=${out.log.length}行 → ${outPath}`);
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: [OPCG_DECKS_FILE=map.json] npx vite-node scripts/cpu-replay-dump.ts <replay.json>...'); process.exit(1); }
for (const f of files) await dumpCpuReplay(f);
process.exit(0);

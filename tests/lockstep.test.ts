// ロックステップ回帰テスト: 2つの実エンジン（実 reactAdapter + 実 createLockstep）を
// in-memory の FakeRoom（DO相当: seq採番して全員へ配信）で接続し、席側クライアントだけが
// 自席の入力/プロンプト応答を dispatch する形で1局を完走させる。
// 検証: ①ターン境界ごとの状態ハッシュが両者一致 ②勝敗一致 ③入力ログのリプレイで同一終局
// （＝オンライン対戦の decisive な同期保証と、再接続リプレイ復帰の根拠）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { GameInput, Seat } from '../src/net/protocol';
import { makeClient, tickClient, bootClient } from './_lockstep-helpers';

// reactAdapter の演出待ち（fxNote 等）は globalThis.setTimeout を使うのでテスト中は即時化。
// dispatch の stall/echo タイマーは module 読込時に実タイマーを確保済み＝影響しない。
let realST: any;
beforeAll(() => { realST = globalThis.setTimeout; (globalThis as any).setTimeout = (cb: any) => { (globalThis as any).setImmediate(cb); return 0 as any; }; });
afterAll(() => { (globalThis as any).setTimeout = realST; });

const tick = () => new Promise<void>((r) => (globalThis as any).setImmediate(r));

interface FakeRoomRec { seq: number; seat: Seat; d: GameInput }
class FakeRoom {
  nextSeq = 1;
  log: FakeRoomRec[] = [];
  receivers: Array<(seq: number, seat: Seat, d: GameInput) => void> = [];
  send(seat: Seat, d: GameInput): void {
    const rec = { seq: this.nextSeq++, seat, d };
    this.log.push(rec);
    for (const recv of this.receivers) {
      (globalThis as any).setImmediate(() => recv(rec.seq, rec.seat, rec.d));
    }
  }
}

async function runMatch(seed: number, deckA: string, deckB: string): Promise<void> {
  const label = `${deckA}vs${deckB}(seed=${seed})`;
  const room = new FakeRoom();
  const A = makeClient('me', (d) => room.send('me', d));   // ホスト
  const B = makeClient('cpu', (d) => room.send('cpu', d)); // ゲスト（視点反転側）
  room.receivers.push((seq, seat, d) => A.driver.onRemoteInput(seq, seat, d));
  room.receivers.push((seq, seat, d) => B.driver.onRemoteInput(seq, seat, d));

  bootClient(A, seed, deckA, deckB);
  bootClient(B, seed, deckA, deckB);

  let iter = 0;
  while (!(A.engine.G.winner && B.engine.G.winner) && iter < 300000) {
    await tick();
    iter++;
    A.driver.pump(); B.driver.pump();
    await tickClient(A);
    await tickClient(B);
    if (A.isDesynced() || B.isDesynced()) break;
  }
  // 終局後の残処理を消化
  for (let i = 0; i < 50; i++) await tick();

  expect(A.isDesynced(), label + ': A desync').toBe(false);
  expect(B.isDesynced(), label + ': B desync').toBe(false);
  expect(iter, label + ': 固まっていない').toBeLessThan(300000);
  expect(A.engine.G.winner, label + ': 勝者あり').toBeTruthy();
  expect(A.engine.G.winner, label + ': 勝者一致').toBe(B.engine.G.winner);
  expect(A.engine.G.turnSeq, label + ': ターン数一致').toBe(B.engine.G.turnSeq);

  // 全ターン境界のhash一致（endTurn回数も一致していること）
  expect(A.endTurns, label + ': endTurn回数一致').toBe(B.endTurns);
  expect(A.hashes.length, label + ': 数ターン進行').toBeGreaterThan(3);
  expect(A.hashes.length, label + ': 境界数一致').toBe(B.hashes.length);
  for (let i = 0; i < A.hashes.length; i++) {
    expect(A.hashes[i], `${label}: ターン境界${i + 1}のhash`).toBe(B.hashes[i]);
  }
  const finalA = A.engine.hashGameState();
  expect(finalA, label + ': 最終hash一致').toBe(B.engine.hashGameState());

  // ---- 入力ログのリプレイ（再接続の完全復帰経路の根拠）----
  const C = makeClient('me', null); // 送信はしない・受信のみ
  bootClient(C, seed, deckA, deckB);
  C.engine.G._sim = true; // 演出・sleepを短絡（実機の復帰リプレイと同条件）
  for (const rec of room.log) C.driver.onRemoteInput(rec.seq, rec.seat, rec.d);
  let jter = 0;
  while (C.driver.nextSeq() <= room.log.length && jter < 300000) {
    await tick();
    jter++;
    C.driver.pump();
  }
  for (let i = 0; i < 50; i++) await tick();
  C.engine.G._sim = false;
  expect(jter, label + ': リプレイが固まっていない').toBeLessThan(300000);
  expect(C.engine.G.winner, label + ': リプレイの勝者一致').toBe(A.engine.G.winner);
  expect(C.engine.hashGameState(), label + ': リプレイの最終hash一致').toBe(finalA);
}

describe('ロックステップ: 2エンジン並走の同期保証', () => {
  it('lucy vs enel: 全ターン境界hash・勝敗一致＋入力ログリプレイで同一終局', async () => {
    await runMatch(424242, 'lucy', 'enel');
  }, 180000);
  it('teach vs hancock: 同上（別リーダー・別seed）', async () => {
    await runMatch(7777, 'teach', 'hancock');
  }, 180000);
  it('ace vs nami: 同上（別リーダー・別seed）', async () => {
    await runMatch(13579, 'ace', 'nami');
  }, 180000);
});

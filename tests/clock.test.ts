// 持ち時間（チェスクロック）の帰属計算ユニットテスト。
// 帰属規則: 「入力kと入力k+1の間の時間は、入力k+1を送った席の消費」。時計の正はサーバts。
// ★カウントは両者のマリガン完了後（=最初の2入力の後）から。最初の2入力は消費しない。
import { describe, it, expect, afterEach } from 'vitest';
import { clockReset, clockNoteInput, clockStop, clockTickForTest, useClockStore, fmtClock } from '../src/net/clock';

afterEach(() => clockStop());

describe('持ち時間クロック', () => {
  it('マリガン（最初の2入力）は消費しない', () => {
    const t0 = 1_000_000;
    clockReset({ mode: 'per', perMin: 30 }, t0, Date.now());
    clockNoteInput('cpu', t0 + 40_000); // ゲストのマリガン（40秒悩んでも消費なし）
    clockNoteInput('me', t0 + 90_000);  // ホストのマリガン（同上）
    clockTickForTest();
    const st = useClockStore.getState();
    expect(30 * 60_000 - st.remain!.me).toBe(0);
    expect(30 * 60_000 - st.remain!.cpu).toBe(0);
  });

  it('per: マリガン後の入力間隔が送信席に帰属し、残り時間が減る', () => {
    const t0 = 1_000_000;
    clockReset({ mode: 'per', perMin: 30 }, t0, Date.now());
    clockNoteInput('cpu', t0 + 5_000);  // マリガン1
    clockNoteInput('me', t0 + 8_000);   // マリガン2（ここからカウント開始）
    // 8秒地点→18秒地点でme(先攻)が行動＝10秒はmeの消費
    clockNoteInput('me', t0 + 18_000);
    // →43秒地点でcpuが行動＝25秒はcpuの消費
    clockNoteInput('cpu', t0 + 43_000);
    clockTickForTest();
    const st = useClockStore.getState();
    expect(st.enabled).toBe(true);
    expect(st.mode).toBe('per');
    expect(30 * 60_000 - st.remain!.me).toBe(10_000);
    expect(30 * 60_000 - st.remain!.cpu).toBe(25_000);
  });

  it('per: 過去のtsや重複は加算しない（単調増加のみ）', () => {
    const t0 = 2_000_000;
    clockReset({ mode: 'per', perMin: 10 }, t0, Date.now());
    clockNoteInput('cpu', t0 + 1_000);
    clockNoteInput('me', t0 + 2_000);   // マリガン完了
    clockNoteInput('me', t0 + 7_000);   // +5秒 me
    clockNoteInput('me', t0 + 7_000);   // 同時刻＝加算なし
    clockNoteInput('cpu', t0 + 5_000);  // 過去＝加算なし
    clockTickForTest();
    const st = useClockStore.getState();
    expect(10 * 60_000 - st.remain!.me).toBe(5_000);
    expect(10 * 60_000 - st.remain!.cpu).toBe(0);
  });

  it('official30: マリガン完了までは満タン、完了時刻から共有時計が減る', () => {
    const now = Date.now();
    clockReset({ mode: 'official30' }, now - 120_000, now - 120_000); // 2分前に開始
    clockTickForTest();
    expect(useClockStore.getState().shared).toBe(30 * 60_000); // マリガン未完了＝満タン
    clockNoteInput('cpu', now - 90_000);
    clockNoteInput('me', now - 60_000); // 1分前にマリガン完了
    clockTickForTest();
    const shared = useClockStore.getState().shared!;
    // マリガン完了から60秒経過 → 残り約29分（誤差1.5秒許容）
    expect(Math.abs(shared - 29 * 60_000)).toBeLessThan(1_500);
  });

  it('リセットで消費が消える（リマッチ）・stopで無効化', () => {
    const t0 = 3_000_000;
    clockReset({ mode: 'per', perMin: 20 }, t0, Date.now());
    clockNoteInput('cpu', t0 + 1_000);
    clockNoteInput('me', t0 + 2_000);
    clockNoteInput('me', t0 + 60_000);
    clockReset({ mode: 'per', perMin: 20 }, t0 + 100_000, Date.now());
    clockTickForTest();
    expect(20 * 60_000 - useClockStore.getState().remain!.me).toBe(0);
    clockStop();
    expect(useClockStore.getState().enabled).toBe(false);
  });

  it('fmtClock: mm:ss 表記', () => {
    expect(fmtClock(30 * 60_000)).toBe('30:00');
    expect(fmtClock(61_000)).toBe('1:01');
    expect(fmtClock(500)).toBe('0:01');
    expect(fmtClock(0)).toBe('0:00');
  });
});

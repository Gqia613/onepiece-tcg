// 持ち時間（チェスクロック）の帰属計算ユニットテスト。
// 帰属規則: 「入力kと入力k+1の間の時間は、入力k+1を送った席の消費」。時計の正はサーバts。
import { describe, it, expect, afterEach } from 'vitest';
import { clockReset, clockNoteInput, clockStop, clockTickForTest, useClockStore, fmtClock } from '../src/net/clock';

afterEach(() => clockStop());

describe('持ち時間クロック', () => {
  it('per: 入力間隔が送信席に帰属し、残り時間が減る', () => {
    const t0 = 1_000_000;
    clockReset({ mode: 'per', perMin: 30 }, t0, Date.now());
    // 開始→10秒後にhost(me)が行動＝10秒はmeの消費
    clockNoteInput('me', t0 + 10_000);
    // →さらに25秒後にguest(cpu)が行動＝25秒はcpuの消費
    clockNoteInput('cpu', t0 + 35_000);
    clockTickForTest();
    const st = useClockStore.getState();
    expect(st.enabled).toBe(true);
    expect(st.mode).toBe('per');
    expect(st.remain).not.toBeNull();
    expect(30 * 60_000 - st.remain!.me).toBe(10_000);
    expect(30 * 60_000 - st.remain!.cpu).toBe(25_000);
  });

  it('per: 過去のtsや重複は加算しない（単調増加のみ）', () => {
    const t0 = 2_000_000;
    clockReset({ mode: 'per', perMin: 10 }, t0, Date.now());
    clockNoteInput('me', t0 + 5_000);
    clockNoteInput('me', t0 + 5_000); // 同時刻＝加算なし
    clockNoteInput('cpu', t0 + 3_000); // 過去＝加算なし
    clockTickForTest();
    const st = useClockStore.getState();
    expect(10 * 60_000 - st.remain!.me).toBe(5_000);
    expect(10 * 60_000 - st.remain!.cpu).toBe(0);
  });

  it('official30: 共有時計が開始tsから減る', () => {
    const t0 = Date.now(); // serverOffset≈0 になるようローカル現在時刻を元期に
    clockReset({ mode: 'official30' }, t0 - 60_000, Date.now() - 60_000);
    clockTickForTest();
    const st = useClockStore.getState();
    expect(st.shared).not.toBeNull();
    // 60秒経過済み → 残り約29分（誤差1秒許容）
    expect(Math.abs(st.shared! - (29 * 60_000))).toBeLessThan(1_500);
    expect(st.remain).toBeNull();
  });

  it('リセットで消費が消える（リマッチ）・stopで無効化', () => {
    const t0 = 3_000_000;
    clockReset({ mode: 'per', perMin: 20 }, t0, Date.now());
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

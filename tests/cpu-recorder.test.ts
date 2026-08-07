// CPU戦リプレイ内部収集（src/net/cpuRecorder.ts）の回帰テスト。
// - デッキスナップショット（全ゾーン走査）・入力のseq採番・終局時POSTの中身・中断時の破棄を検証する。
// - エンジン実体は不要（recorder は G を読むだけ）＝フェイク G で駆動する。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { beginCpuRecording, recordCpuInput, endCpuRecording } from '../src/net/cpuRecorder';
import { useEngineStore } from '../src/state/engineStore';
import { useNetStore } from '../src/state/netStore';

const mk = (no: string) => ({ no, uid: Math.floor(Math.random() * 1e6) });

function fakeEngine() {
  const G: any = {
    inGame: true,
    winner: null,
    turnSeq: 0,
    players: {
      me: {
        leader: mk('OP01-001'),
        deck: [mk('OP01-016'), mk('OP01-016')],
        hand: [mk('OP01-025')],
        life: [mk('OP01-024')],
        trash: [],
        chars: [],
        stage: null,
      },
      cpu: {
        leader: mk('OP02-001'),
        deck: [mk('OP02-004')],
        hand: [],
        life: [],
        trash: [],
        chars: [],
        stage: null,
      },
    },
  };
  return { G };
}

const META = {
  seed: 12345,
  firstPref: 'random' as const,
  deckIds: { me: 'custom-1', cpu: 'teach' },
  deckNames: { me: 'マイデッキ', cpu: '黒ティーチ' },
  playerName: 'michiru',
};

describe('cpuRecorder', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    useNetStore.getState().setMode('offline');
    useEngineStore.getState().setEnd(null);
  });

  afterEach(() => {
    endCpuRecording();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('終局(winner)でリプレイをPOSTする（デッキ復元・入力seq・勝敗変換）', async () => {
    const eng = fakeEngine();
    beginCpuRecording(eng, META);
    recordCpuInput({ t: 'prompt', v: false });        // マリガン: しない
    recordCpuInput({ t: 'play', uid: 42 });
    recordCpuInput({ t: 'endTurn' });
    eng.G.winner = 'me';
    eng.G.turnSeq = 9;
    useEngineStore.getState().setEnd({ win: true, reason: 'ライフ0' }); // 購読経由で check() が走る
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/match/cpu');
    const body = JSON.parse(init.body);
    expect(body.winner).toBe('host');
    expect(body.reason).toBe('ライフ0');
    expect(body.turns).toBe(9);
    expect(body.seed).toBe(12345);
    expect(body.leader).toBe('OP01-001');
    expect(body.cpu_leader).toBe('OP02-001');
    // デッキはゾーン走査で復元（me: deck2枚+hand1枚+life1枚）
    expect(body.replay.decks.host).toEqual({
      leader: 'OP01-001',
      list: { 'OP01-016': 2, 'OP01-025': 1, 'OP01-024': 1 },
      name: 'マイデッキ',
    });
    expect(body.replay.first).toBeNull(); // firstPref random → null（オンラインreplayと同形）
    expect(body.replay.inputs.map((r: any) => r.seq)).toEqual([1, 2, 3]);
    expect(body.replay.inputs.every((r: any) => r.seat === 'host')).toBe(true);
    expect(body.replay.cpu.agent).toBe('puct');
    expect(body.replay.cpu.deckIds).toEqual({ me: 'custom-1', cpu: 'teach' });
  });

  it('終局前に盤面が破棄されたら送信しない（中断）', async () => {
    const eng = fakeEngine();
    beginCpuRecording(eng, META);
    recordCpuInput({ t: 'endTurn' });
    eng.G.inGame = false;
    useEngineStore.getState().bump();
    // その後 winner が立っても記録は破棄済み
    eng.G.winner = 'me';
    useEngineStore.getState().bump();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('オンライン中の入力は記録しない', async () => {
    const eng = fakeEngine();
    beginCpuRecording(eng, META);
    useNetStore.getState().setMode('online');
    recordCpuInput({ t: 'endTurn' });
    useNetStore.getState().setMode('offline');
    recordCpuInput({ t: 'play', uid: 1 });
    eng.G.winner = 'cpu';
    useEngineStore.getState().setEnd({ win: false, reason: 'ライフ0' });
    await vi.advanceTimersByTimeAsync(300);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.winner).toBe('guest');
    expect(body.replay.inputs).toHaveLength(1);
    expect(body.replay.inputs[0].d.t).toBe('play');
  });

  it('AI探索中の一時的なwinnerでは誤検知しない（2026-08-07 実バグ回帰: 38/39件draw化）', async () => {
    const eng = fakeEngine();
    beginCpuRecording(eng, META);
    recordCpuInput({ t: 'endTurn' });
    // ロールアウト中: _sim=true のまま winner が一時的に立ち、ログ等で store 購読が発火する
    eng.G._sim = true;
    eng.G.winner = 'cpu';
    useEngineStore.getState().pushLog({ cls: 'sys', html: 'rollout' });
    // 探索の状態復元（winner が戻る）
    eng.G.winner = null;
    eng.G._sim = false;
    useEngineStore.getState().bump();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).not.toHaveBeenCalled();
    // 記録は生きている＝以降の入力も記録され、実終局で正しく1回送信される
    recordCpuInput({ t: 'play', uid: 7 });
    eng.G.winner = 'me';
    eng.G.turnSeq = 12;
    useEngineStore.getState().setEnd({ win: true, reason: 'ライフ0で被弾' });
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.winner).toBe('host');
    expect(body.reason).toBe('ライフ0で被弾');
    expect(body.turns).toBe(12);
    expect(body.replay.inputs).toHaveLength(2);
  });

  it('復元前の隙間（_sim=false・winner一時残存・endなし）でも送信しない', async () => {
    const eng = fakeEngine();
    beginCpuRecording(eng, META);
    eng.G.winner = 'cpu'; // 探索の復元順序の隙間を模擬（end は出ていない）
    useEngineStore.getState().bump();
    eng.G.winner = null;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('前局の勝敗画面(end)が未クリアでも新局の記録を殺さない（参照同一性ガード）', async () => {
    useEngineStore.getState().setEnd({ win: false, reason: '前局' }); // 未クリアの前局end
    const eng = fakeEngine();
    beginCpuRecording(eng, META);
    useEngineStore.getState().bump(); // 同一参照の end では終局扱いしない
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).not.toHaveBeenCalled();
    eng.G.winner = 'me';
    eng.G.turnSeq = 5;
    useEngineStore.getState().setEnd({ win: true, reason: 'ライフ0' }); // 実終局＝新オブジェクト
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).winner).toBe('host');
  });

  it('再開始(begin)で前局の記録を破棄し、購読も張り替える', async () => {
    const e1 = fakeEngine();
    beginCpuRecording(e1, META);
    recordCpuInput({ t: 'endTurn' });
    const e2 = fakeEngine();
    beginCpuRecording(e2, { ...META, seed: 777 });
    e2.G.winner = 'me';
    useEngineStore.getState().setEnd({ win: true, reason: 'ライフ0' });
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.seed).toBe(777);
    expect(body.replay.inputs).toHaveLength(0); // e1 の入力は持ち越さない
  });
});

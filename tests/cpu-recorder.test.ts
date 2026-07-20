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

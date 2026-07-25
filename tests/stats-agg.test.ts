// 戦績ダッシュボードの集計（リーダー別・相性マトリクス・プレイヤー直接対決）の単体テスト
import { describe, it, expect } from 'vitest';
import { aggregateMatches } from '../src/screens/Stats';
import type { StatsMatchRow } from '../src/api/client';

const m = (over: Partial<StatsMatchRow>): StatsMatchRow => ({
  id: 1, host_uid: 'u1', guest_uid: 'u2', host_name: 'アリス', guest_name: 'ボブ',
  host_leader: 'OP01-001', guest_leader: 'OP01-060', winner: 'host',
  reason: null, turns: 10, created_at: '2026-07-20 12:00:00',
  ...over,
});

describe('aggregateMatches（戦績集計）', () => {
  it('リーダー別の勝敗と相性セルを両視点で数える', () => {
    const agg = aggregateMatches([
      m({ id: 1, winner: 'host' }),                    // 001がホストで勝ち
      m({ id: 2, winner: 'guest' }),                   // 060がゲストで勝ち
      m({ id: 3, host_leader: 'OP01-060', guest_leader: 'OP01-001', winner: 'host' }), // 060がホストで勝ち
    ]);
    expect(agg.leader['OP01-001']).toEqual({ w: 1, l: 2, d: 0 });
    expect(agg.leader['OP01-060']).toEqual({ w: 2, l: 1, d: 0 });
    // 相性: 001 → 060 は 1勝2敗（席が入れ替わっても正しく合算）
    expect(agg.cell['OP01-001']['OP01-060']).toEqual({ w: 1, l: 2, d: 0 });
    expect(agg.cell['OP01-060']['OP01-001']).toEqual({ w: 2, l: 1, d: 0 });
  });

  it('引き分けは勝率母数に入れず d に数える', () => {
    const agg = aggregateMatches([m({ winner: 'draw' })]);
    expect(agg.leader['OP01-001']).toEqual({ w: 0, l: 0, d: 1 });
    expect(agg.cell['OP01-001']['OP01-060'].d).toBe(1);
  });

  it('プレイヤー直接対決は席（host/guest）が入れ替わっても同じペアに合算する', () => {
    const agg = aggregateMatches([
      m({ id: 1, winner: 'host' }),  // u1勝ち
      m({ id: 2, host_uid: 'u2', guest_uid: 'u1', host_name: 'ボブ', guest_name: 'アリス', winner: 'guest' }), // u1勝ち
      m({ id: 3, winner: 'guest' }), // u2勝ち
      m({ id: 4, winner: 'draw' }),
    ]);
    const pair = agg.pairs['u1|u2'];
    expect(pair).toBeTruthy();
    expect(pair.aw).toBe(2); // u1
    expect(pair.bw).toBe(1); // u2
    expect(pair.d).toBe(1);
    expect(agg.names.u1).toBe('アリス');
    expect(agg.names.u2).toBe('ボブ');
    expect(agg.player.u1).toEqual({ w: 2, l: 1, d: 1 });
  });

  it('ミラーマッチは同一リーダーに1勝1敗として入る', () => {
    const agg = aggregateMatches([m({ guest_leader: 'OP01-001', winner: 'host' })]);
    expect(agg.leader['OP01-001']).toEqual({ w: 1, l: 1, d: 0 });
    expect(agg.cell['OP01-001']['OP01-001']).toEqual({ w: 1, l: 1, d: 0 });
  });

  it('leaders は勝率降順で並ぶ', () => {
    const agg = aggregateMatches([
      m({ id: 1, winner: 'guest' }), // 060: 1-0 / 001: 0-1
      m({ id: 2, host_leader: 'OP02-001', guest_leader: 'OP01-001', winner: 'draw' }), // OP02-001 決着なし
    ]);
    expect(agg.leaders[0]).toBe('OP01-060');           // 100%
    expect(agg.leaders[agg.leaders.length - 1]).toBe('OP02-001'); // 決着なしは最後
  });
});

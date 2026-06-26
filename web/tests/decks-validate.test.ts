import { describe, it, expect } from 'vitest';
import { validateDeck } from '../functions/api/decks.js';

const leader = 'OP01-001';
function deck(extra?: any) {
  // 50枚（リーダー除く）: 例として複数カードで合計50
  return { name: 'テスト', leader, list: { 'OP01-016': 4, 'OP01-024': 4, 'OP01-025': 4, 'OP01-026': 4, 'OP01-013': 30, 'OP01-006': 4 }, ...extra };
}

describe('validateDeck (server)', () => {
  it('accepts a well-formed 50-card deck', () => {
    const v = validateDeck(deck());
    expect(v.ok).toBe(true);
    expect(v.leader).toBe(leader);
    const total = Object.values(v.list as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(total).toBe(50);
  });

  it('rejects non-50 total', () => {
    expect(validateDeck({ leader, list: { 'OP01-016': 4 } }).ok).toBe(false);
  });
  it('rejects bad leader', () => {
    expect(validateDeck({ leader: '!!', list: { 'OP01-016': 50 } }).ok).toBe(false);
  });
  it('rejects empty list', () => {
    expect(validateDeck({ leader, list: {} }).ok).toBe(false);
  });
  it('rejects bad card no', () => {
    expect(validateDeck({ leader, list: { 'bad no!': 50 } }).ok).toBe(false);
  });
  it('rejects non-object body', () => {
    expect(validateDeck(null).ok).toBe(false);
    expect(validateDeck({ leader, list: [] }).ok).toBe(false);
  });
  it('clamps/trims name and defaults', () => {
    const v = validateDeck({ leader, list: { 'OP01-013': 50 }, name: '  ' });
    expect(v.ok).toBe(true);
    expect(v.name).toBe('マイデッキ');
  });
});

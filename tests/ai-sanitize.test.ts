import { describe, it, expect } from 'vitest';
import { sanitize } from '../functions/api/ai.js';

describe('ai proxy sanitize', () => {
  it('keeps a valid request and clamps max_tokens', () => {
    const s = sanitize({ model: 'claude-opus-4-8', max_tokens: 99999, system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
    expect(s).toBeTruthy();
    expect(s!.max_tokens).toBe(4096); // クランプ
    expect(s!.model).toBe('claude-opus-4-8');
    expect(s!.system).toBe('sys');
  });
  it('falls back to default model (sonnet) for unknown/expensive model', () => {
    const s = sanitize({ model: 'gpt-4', max_tokens: 100, messages: [{ role: 'user', content: 'x' }] });
    expect(s!.model).toBe('claude-sonnet-4-6'); // 許可リスト外 → 既定(sonnet)
  });
  it('defaults max_tokens when missing/invalid', () => {
    expect(sanitize({ messages: [{ role: 'user', content: 'x' }] })!.max_tokens).toBe(1024);
    expect(sanitize({ max_tokens: 'abc', messages: [{ role: 'user', content: 'x' }] })!.max_tokens).toBe(1024);
  });
  it('rejects missing/empty messages', () => {
    expect(sanitize({ system: 's' })).toBeNull();
    expect(sanitize({ messages: [] })).toBeNull();
    expect(sanitize(null)).toBeNull();
  });
  it('passes through tools/tool_choice for structured output', () => {
    const s = sanitize({ messages: [{ role: 'user', content: 'x' }], tools: [{ name: 't' }], tool_choice: { type: 'tool', name: 't' } });
    expect(Array.isArray(s!.tools)).toBe(true);
    expect(s!.tool_choice).toBeTruthy();
  });
});

import { describe, it, expect } from 'vitest';
import { signJWT, verifyJWT } from '../functions/_lib/jwt.js';
import { hashPassword, verifyPassword } from '../functions/_lib/password.js';

const SECRET = 'test-secret-please-change';

describe('jwt (HS256)', () => {
  it('roundtrips payload', async () => {
    const token = await signJWT({ uid: 'u1', un: 'alice' }, SECRET, 60);
    const payload = await verifyJWT(token, SECRET);
    expect(payload).toBeTruthy();
    expect(payload.uid).toBe('u1');
    expect(payload.un).toBe('alice');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('rejects wrong secret', async () => {
    const token = await signJWT({ uid: 'u1' }, SECRET, 60);
    expect(await verifyJWT(token, 'other-secret')).toBeNull();
  });

  it('rejects tampered token', async () => {
    const token = await signJWT({ uid: 'u1' }, SECRET, 60);
    const parts = token.split('.');
    const tampered = parts[0] + '.' + parts[1] + 'x.' + parts[2];
    expect(await verifyJWT(tampered, SECRET)).toBeNull();
  });

  it('rejects expired token', async () => {
    const token = await signJWT({ uid: 'u1' }, SECRET, -10); // 既に期限切れ
    expect(await verifyJWT(token, SECRET)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifyJWT('', SECRET)).toBeNull();
    expect(await verifyJWT('a.b', SECRET)).toBeNull();
    expect(await verifyJWT(null as any, SECRET)).toBeNull();
  });
});

describe('password (PBKDF2)', () => {
  it('hashes and verifies', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(await verifyPassword('correct horse', hash, salt)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect(await verifyPassword('wrong horse', hash, salt)).toBe(false);
  });

  it('uses a random salt (different hashes for same password)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});

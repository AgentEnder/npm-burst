import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from './crypto';

describe('crypto', () => {
  const testKey = 'a'.repeat(64);

  it('round trips token encryption', async () => {
    const token = 'ghs_example_token';
    const encrypted = await encryptToken(token, testKey);
    expect(encrypted).toBeInstanceOf(Uint8Array);
    const decrypted = await decryptToken(encrypted, testKey);
    expect(decrypted).toBe(token);
  });

  it('uses a fresh nonce on every encryption', async () => {
    const first = await encryptToken('same-token', testKey);
    const second = await encryptToken('same-token', testKey);
    expect(Buffer.from(first).toString('hex')).not.toBe(
      Buffer.from(second).toString('hex')
    );
  });
});

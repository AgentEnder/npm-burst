const NONCE_LENGTH = 12;

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    hexToBytes(hexKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptToken(
  plaintext: string,
  hexKey: string
): Promise<Uint8Array> {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  const bytes = new Uint8Array(NONCE_LENGTH + encrypted.byteLength);
  bytes.set(iv, 0);
  bytes.set(new Uint8Array(encrypted), NONCE_LENGTH);
  return bytes;
}

export async function decryptToken(
  encrypted: Uint8Array,
  hexKey: string
): Promise<string> {
  if (encrypted.byteLength <= NONCE_LENGTH) {
    throw new Error('Encrypted token is malformed');
  }
  const key = await importKey(hexKey);
  const iv = encrypted.slice(0, NONCE_LENGTH);
  const payload = encrypted.slice(NONCE_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    payload
  );
  return new TextDecoder().decode(decrypted);
}

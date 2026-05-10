/**
 * AES-GCM encrypt/decrypt for OAuth tokens + IMAP passwords.
 *
 * Convex has no native KMS. We encrypt with a 32-byte key sourced from the
 * `ENCRYPTION_KEY` env var (hex). Output format: `iv.cipher` (each base64).
 *
 * Uses the standard Web Crypto API (`globalThis.crypto.subtle`), which is
 * available in both Convex's Node runtime and its V8 isolates.
 */

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit IV recommended for GCM

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Detach from the underlying SharedArrayBuffer (if any) so Web Crypto accepts it.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

function getKeyMaterial(): ArrayBuffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      '[crypto] ENCRYPTION_KEY env var is not set. Generate a 32-byte hex string ' +
        '(node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))") and run ' +
        '`pnpm exec convex env set ENCRYPTION_KEY <hex>`.',
    );
  }
  if (hex.length !== KEY_BYTES * 2) {
    throw new Error(
      `[crypto] ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex chars (got ${hex.length})`,
    );
  }
  const buf = new ArrayBuffer(KEY_BYTES);
  const view = new Uint8Array(buf);
  for (let i = 0; i < KEY_BYTES; i++) {
    view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

async function getCryptoKey(): Promise<CryptoKey> {
  const raw = getKeyMaterial();
  return await globalThis.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

function b64encode(bytes: Uint8Array): string {
  // Base64 (standard, with padding). Convex Node has Buffer; isolates have btoa.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    s += String.fromCharCode(byte);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).btoa(s);
}

function b64decode(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bin = (globalThis as any).atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypts `plain` and returns `iv.cipherWithTag` (each base64). */
export async function encrypt(plain: string): Promise<string> {
  if (typeof plain !== 'string') {
    throw new Error('[crypto] encrypt: plaintext must be a string');
  }
  const key = await getCryptoKey();
  const ivBytes = new Uint8Array(IV_BYTES);
  globalThis.crypto.getRandomValues(ivBytes);
  const encoded = new TextEncoder().encode(plain);
  const cipherBuf = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    key,
    toArrayBuffer(encoded),
  );
  const cipher = new Uint8Array(cipherBuf);
  return `${b64encode(ivBytes)}.${b64encode(cipher)}`;
}

/** Decrypts a value produced by `encrypt`. Throws on any failure. */
export async function decrypt(cipher: string): Promise<string> {
  const parts = cipher.split('.');
  if (parts.length !== 2) {
    throw new Error('[crypto] decrypt: malformed ciphertext (expected `iv.cipher`)');
  }
  const ivStr = parts[0];
  const dataStr = parts[1];
  if (!ivStr || !dataStr) {
    throw new Error('[crypto] decrypt: malformed ciphertext');
  }
  const iv = b64decode(ivStr);
  const data = b64decode(dataStr);
  const key = await getCryptoKey();
  const plainBuf = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(data),
  );
  return new TextDecoder().decode(plainBuf);
}

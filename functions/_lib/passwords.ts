const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** Encodes a byte array as lowercase hex. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Decodes a hex string into a byte array. */
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Imports a password as a PBKDF2 key via WebCrypto. */
function importKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
}

/** Derives PBKDF2-SHA256 bits for a password with the given salt and iterations. */
async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await importKey(password);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Constant-time comparison of two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** Hashes a password as "saltHex:iterations:hashHex" (PBKDF2-SHA256, 100k iters). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${toHex(salt)}:${ITERATIONS}:${toHex(hash)}`;
}

/** Verifies a password against a stored "saltHex:iterations:hashHex" hash. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const [saltHex, iterStr, hashHex] = parts;
  const iterations = Number(iterStr);
  if (!saltHex || !hashHex || !Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }
  const candidate = await derive(password, fromHex(saltHex), iterations);
  return timingSafeEqual(candidate, fromHex(hashHex));
}

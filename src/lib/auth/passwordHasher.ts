const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTE_LENGTH = 16;
const DERIVED_KEY_BITS = 256;

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const len = hex.length / 2;
  return Uint8Array.from({ length: len }, (_, idx) =>
    Number.parseInt(hex.slice(idx * 2, idx * 2 + 2), 16),
  );
}

/**
 * Constant-time byte array equality check to prevent timing side-channel attacks.
 */
export function constantTimeEqualBytes(
  a: Uint8Array,
  b: Uint8Array,
): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    const byteA = a.at(i) ?? 0;
    const byteB = b.at(i) ?? 0;
    diff |= byteA ^ byteB;
  }
  return diff === 0;
}

async function derivePbkdf2Bits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const normalizedSalt = new Uint8Array(salt.byteLength);
  normalizedSalt.set(salt);

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: normalizedSalt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    DERIVED_KEY_BITS,
  );
  return new Uint8Array(bits);
}

/**
 * Hashes a password using PBKDF2-HMAC-SHA256 with 100,000 iterations and a 16-byte cryptographic salt.
 * Format: `pbkdf2_sha256$<iterations>$<saltHex>$<hashHex>`
 */
export async function hashPasswordPbkdf2(
  plainPassword: string,
  customSalt?: Uint8Array,
): Promise<string> {
  if (plainPassword.length < 4) {
    throw new Error('Password must be at least 4 characters long');
  }
  const salt =
    customSalt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const derived = await derivePbkdf2Bits(
    plainPassword,
    salt,
    PBKDF2_ITERATIONS,
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

/**
 * Verifies a plaintext password against a stored `pbkdf2_sha256$iterations$salt$hash` digest
 * using constant-time byte comparison.
 */
export async function verifyPasswordPbkdf2(
  plainPassword: string,
  storedDigest: string,
): Promise<boolean> {
  const parts = storedDigest.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
    return false;
  }
  const iterations = Number.parseInt(parts[1] ?? '', 10);
  if (!Number.isSafeInteger(iterations) || iterations < 10_000 || iterations > 1_000_000) {
    return false;
  }
  const saltBytes = hexToBytes(parts[2] ?? '');
  const expectedHashBytes = hexToBytes(parts[3] ?? '');
  if (
    saltBytes === null ||
    expectedHashBytes === null ||
    saltBytes.byteLength < 8 ||
    expectedHashBytes.byteLength !== DERIVED_KEY_BITS / 8
  ) {
    return false;
  }

  const candidateHashBytes = await derivePbkdf2Bits(
    plainPassword,
    saltBytes,
    iterations,
  );
  return constantTimeEqualBytes(candidateHashBytes, expectedHashBytes);
}

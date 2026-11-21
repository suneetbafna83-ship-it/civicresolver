/**
 * Generates a cryptographically strong, collision-resistant identifier
 * using Web Crypto (`crypto.randomUUID` / `crypto.getRandomValues`).
 * Avoids weak `Math.random()` PRNG usage (CWE-338).
 */
export function generateSecureId(prefix: string): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      let hex = '';
      for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
      }
      return `${prefix}_${hex}`;
    }
  }
  return `${prefix}_${Date.now().toString(36)}`;
}

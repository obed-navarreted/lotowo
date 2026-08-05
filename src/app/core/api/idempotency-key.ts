interface BrowserCrypto {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
}

/**
 * Creates a request key in both secure contexts and LAN-hosted HTTP pages.
 * `crypto.randomUUID()` is intentionally unavailable in some browsers when
 * the application is opened through an http://192.168.x.x address.
 */
export function createIdempotencyKey(source: BrowserCrypto | null | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') {
    return source.randomUUID();
  }

  if (typeof source?.getRandomValues === 'function') {
    const bytes = source.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  }

  return `sale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

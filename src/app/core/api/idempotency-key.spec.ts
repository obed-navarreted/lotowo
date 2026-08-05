import { createIdempotencyKey } from './idempotency-key';

describe('createIdempotencyKey', () => {
  it('uses randomUUID when the page has a secure browser context', () => {
    const key = createIdempotencyKey({ randomUUID: () => 'secure-context-key' });

    expect(key).toBe('secure-context-key');
  });

  it('creates a UUID-shaped key when randomUUID is unavailable over LAN HTTP', () => {
    const key = createIdempotencyKey({
      getRandomValues: (array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
        array.fill(17);
        return array;
      }
    });

    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('still creates a non-empty key when Web Crypto is unavailable', () => {
    expect(createIdempotencyKey(null)).toMatch(/^sale-[a-z0-9]+-[a-z0-9]+$/);
  });
});

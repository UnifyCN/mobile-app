/**
 * A new operation identity (UUID v4) for one user intent (mobile-app#361).
 * Hermes has no crypto.randomUUID, and this change adds no native module, so it
 * uses crypto.getRandomValues when present and Math.random otherwise. The id only
 * has to be unique within one account: the server also refuses a reused id with
 * a different payload (409 operation_id_reused), so a collision cannot apply the
 * wrong change.
 */
export function newOperationId(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

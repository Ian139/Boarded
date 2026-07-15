import { nanoid } from 'nanoid/non-secure';

export function createId(): string {
  return nanoid();
}

export function createShareToken(size = 10): string {
  return nanoid(size);
}

/**
 * Generate a RFC 4122 version 4 UUID without relying on a platform crypto API.
 * Native runtimes do not consistently expose `crypto.randomUUID`, while the
 * Supabase entity tables require UUID primary keys.
 */
export function createUuid(): string {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function ensureUuid(value?: string | null): string {
  return isUuid(value) ? value : createUuid();
}

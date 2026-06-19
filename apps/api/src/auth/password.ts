import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Hash della password con scrypt (salt + hash, formato "salt:hash"). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Verifica una password contro l'hash memorizzato, in tempo costante. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, 'hex');
  return derived.length === original.length && timingSafeEqual(derived, original);
}

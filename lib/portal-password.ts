import { scryptSync, timingSafeEqual } from 'crypto';

const SALT = process.env.PORTAL_PASSWORD_SALT ?? 'muscle-portal-change-me';

export function hashPortalPassword(password: string): string {
  return scryptSync(password.trim(), SALT, 32).toString('hex');
}

export function verifyPortalPassword(password: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password.trim(), SALT, 32);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

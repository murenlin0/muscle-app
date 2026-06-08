import { scryptSync, timingSafeEqual } from 'crypto';

const PIN_SALT = process.env.STAFF_PIN_SALT ?? 'muscle-change-me-in-production';

export function hashStaffPin(pin: string): string {
  return scryptSync(pin.trim(), PIN_SALT, 32).toString('hex');
}

export function verifyStaffPin(pin: string, pinHash: string | null | undefined): boolean {
  const normalized = pin.trim();
  if (!normalized) return false;

  if (pinHash) {
    const expected = Buffer.from(pinHash, 'hex');
    const actual = scryptSync(normalized, PIN_SALT, 32);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  const bootstrap = process.env.STAFF_BOOTSTRAP_PIN ?? '1234';
  return normalized === bootstrap;
}

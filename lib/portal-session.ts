import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { isStoreSlug, type StoreSlug } from '@/lib/stores';

const PORTAL_COOKIE = 'muscle_portal_session';

export type PortalRole = 'super' | 'store' | 'staff';

export type PortalSession =
  | { role: 'super'; displayName: string }
  | { role: 'store'; storeId: StoreSlug; storeIds: StoreSlug[]; displayName: string }
  | { role: 'staff'; staffId: string; staffName: string };

function secret(): string {
  const value = process.env.PORTAL_SESSION_SECRET ?? process.env.ADMIN_IMPORT_SECRET;
  if (!value) {
    throw new Error('Missing PORTAL_SESSION_SECRET or ADMIN_IMPORT_SECRET');
  }
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function pack(parts: string[]): string {
  const payload = parts.join('|');
  return `${payload}.${sign(payload)}`;
}

function unpack(token: string): string[] | null {
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expectedSig = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return payload.split('|');
}

export function createPortalSessionToken(session: PortalSession): string {
  const ts = String(Date.now());
  if (session.role === 'super') {
    return pack(['super', session.displayName, ts]);
  }
  if (session.role === 'store') {
    return pack(['store', session.storeIds.join(','), session.displayName, ts]);
  }
  return pack(['staff', session.staffId, session.staffName, ts]);
}

export function parsePortalSessionToken(token: string | undefined): PortalSession | null {
  if (!token) return null;
  const parts = unpack(token);
  if (!parts || parts.length < 3) return null;

  const role = parts[0] as PortalRole;
  if (role === 'super' && parts.length === 3) {
    return { role: 'super', displayName: parts[1] };
  }
  if (role === 'store' && parts.length === 4) {
    const storeIds = parts[1].split(',').filter(isStoreSlug) as StoreSlug[];
    const storeId = storeIds[0] ?? 'store1';
    return { role: 'store', storeId, storeIds, displayName: parts[2] };
  }
  if (role === 'staff' && parts.length === 4) {
    return { role: 'staff', staffId: parts[1], staffName: parts[2] };
  }
  return null;
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const jar = await cookies();
  return parsePortalSessionToken(jar.get(PORTAL_COOKIE)?.value);
}

export async function setPortalSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function clearPortalSessionCookie() {
  const jar = await cookies();
  jar.delete(PORTAL_COOKIE);
  jar.delete('muscle_staff_session');
  jar.delete('muscle_admin_session');
}

export function verifyBootstrapSuperPassword(password: string): boolean {
  const expected =
    process.env.SUPER_ADMIN_SECRET ??
    process.env.ADMIN_IMPORT_SECRET;
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyBootstrapStorePassword(password: string): boolean {
  const expected =
    process.env.STORE_ADMIN_SECRET ??
    process.env.ADMIN_IMPORT_SECRET;
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function portalHomePath(session: PortalSession): string {
  if (session.role === 'staff') return '/staff';
  if (session.role === 'store') {
    return session.storeIds.length === 1 ? `/manager/${session.storeIds[0]}` : '/manager';
  }
  return '/admin';
}

export function canAccessStore(session: PortalSession, storeId: StoreSlug): boolean {
  if (session.role === 'super') return true;
  if (session.role === 'store') return session.storeIds.includes(storeId);
  return false;
}

export function canViewReports(session: PortalSession, storeId?: StoreSlug): boolean {
  if (session.role === 'staff') return false;
  if (session.role === 'super') return true;
  if (session.role === 'store' && storeId) return session.storeIds.includes(storeId);
  if (session.role === 'store') return true;
  return false;
}

export function canManageStaff(
  session: PortalSession,
  storeId: StoreSlug,
): boolean {
  if (session.role === 'super') return true;
  if (session.role === 'store') return session.storeIds.includes(storeId);
  return false;
}

export function canManagePortalAccounts(session: PortalSession): boolean {
  return session.role === 'super';
}

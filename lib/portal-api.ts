import { NextResponse } from 'next/server';
import type { NextResponse as NextResponseType } from 'next/server';
import {
  canAccessStore,
  canManagePortalAccounts,
  canManageStaff,
  canViewReports,
  getPortalSession,
  type PortalSession,
} from '@/lib/portal-session';
import { findStaffForLogin } from '@/lib/staff-auth-server';
import type { StoreSlug } from '@/lib/stores';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
};

export function portalJson<T>(body: T, init?: ResponseInit): NextResponseType {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...init?.headers },
  });
}

export async function requirePortalSession(): Promise<PortalSession | NextResponse> {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 });
  }
  return session;
}

export async function requireStaffSession(): Promise<
  Extract<PortalSession, { role: 'staff' }> | NextResponse
> {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (session.role !== 'staff') {
    return NextResponse.json({ error: '需要師傅身分' }, { status: 403 });
  }
  return session;
}

export async function requireStoreAccess(
  storeId: StoreSlug,
): Promise<PortalSession | NextResponse> {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (!canAccessStore(session, storeId)) {
    return NextResponse.json({ error: '無權存取此分店' }, { status: 403 });
  }
  return session;
}

export async function requireStaffManagement(
  storeId: StoreSlug,
): Promise<PortalSession | NextResponse> {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (!canManageStaff(session, storeId)) {
    return NextResponse.json({ error: '無權管理師傅' }, { status: 403 });
  }
  return session;
}

export async function requireSuperAdmin(): Promise<
  Extract<PortalSession, { role: 'super' }> | NextResponse
> {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (session.role !== 'super') {
    return NextResponse.json({ error: '需要總管理員身分' }, { status: 403 });
  }
  return session;
}

export async function requireReportsAccess(
  storeId?: StoreSlug,
): Promise<PortalSession | NextResponse> {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (!canViewReports(session, storeId)) {
    return NextResponse.json({ error: '師傅無法查看報表' }, { status: 403 });
  }
  return session;
}

export type ClientsAccessContext = {
  session: PortalSession;
  storeId: StoreSlug;
};

export async function requireClientsAccess(
  storeParam?: StoreSlug | null,
): Promise<ClientsAccessContext | NextResponse> {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;

  if (session.role === 'super') {
    return { session, storeId: storeParam ?? 'store1' };
  }

  if (session.role === 'store') {
    if (storeParam && storeParam !== session.storeId) {
      return NextResponse.json({ error: '無權查看其他分店' }, { status: 403 });
    }
    return { session, storeId: session.storeId };
  }

  const staff = await findStaffForLogin(session.staffId);
  if (!staff?.store_id) {
    return NextResponse.json({ error: '找不到師傅分店' }, { status: 403 });
  }
  const staffStoreId = staff.store_id as StoreSlug;
  if (storeParam && storeParam !== staffStoreId) {
    return NextResponse.json({ error: '無權查看其他分店' }, { status: 403 });
  }
  return { session, storeId: staffStoreId };
}

export async function requirePortalAccountManagement(): Promise<
  PortalSession | NextResponse
> {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (!canManagePortalAccounts(session)) {
    return NextResponse.json({ error: '需要總管理員身分' }, { status: 403 });
  }
  return session;
}

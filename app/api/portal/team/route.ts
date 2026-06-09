import { NextResponse } from 'next/server';
import { parseStoreFromParamsAsync } from '@/lib/api-store';
import { requirePortalSession } from '@/lib/portal-api';
import { createTeamMember, listTeamMembers, type TeamPermission } from '@/lib/team-server';
import type { StoreSlug } from '@/lib/stores';

function storeFilterFromSession(
  session: Awaited<ReturnType<typeof requirePortalSession>>,
): StoreSlug | undefined {
  if (session instanceof NextResponse) return undefined;
  if (session.role === 'store') return session.storeId;
  return undefined;
}

export async function GET(request: Request) {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (session.role === 'staff') {
    return NextResponse.json({ error: '師傅無法管理人員' }, { status: 403 });
  }

  const url = new URL(request.url);
  const storeParam = url.searchParams.get('store');
  let storeFilter = storeFilterFromSession(session);

  if (session.role === 'super' && storeParam) {
    const parsed = await parseStoreFromParamsAsync(
      Promise.resolve({ store: storeParam }),
    );
    if (parsed instanceof NextResponse) return parsed;
    storeFilter = parsed;
  }

  try {
    const members = await listTeamMembers(storeFilter);
    return NextResponse.json({ members });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (session.role === 'staff') {
    return NextResponse.json({ error: '師傅無法管理人員' }, { status: 403 });
  }

  let body: {
    storeId?: StoreSlug;
    displayName?: string;
    staffPin?: string;
    adminPassword?: string;
    permissions?: TeamPermission[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const storeId =
    session.role === 'store' ? session.storeId : body.storeId;
  if (!storeId || !body.displayName?.trim() || !body.staffPin?.trim()) {
    return NextResponse.json({ error: '請填寫姓名、PIN 與分店' }, { status: 400 });
  }

  try {
    await createTeamMember(storeId, {
      displayName: body.displayName,
      staffPin: body.staffPin,
      adminPassword: body.adminPassword,
      permissions: body.permissions ?? ['staff'],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '建立失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

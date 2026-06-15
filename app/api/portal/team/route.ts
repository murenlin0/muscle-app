import { NextResponse } from 'next/server';
import { parseStoreFromParamsAsync } from '@/lib/api-store';
import { requirePortalSession } from '@/lib/portal-api';
import {
  batchUpdateTeamMembers,
  createTeamMember,
  listTeamMembers,
  type AccessLevel,
} from '@/lib/team-server';
import type { StoreSlug } from '@/lib/stores';

function storeFilterFromSession(
  session: Awaited<ReturnType<typeof requirePortalSession>>,
): StoreSlug | undefined {
  if (session instanceof NextResponse) return undefined;
  if (session.role === 'store') return session.storeId;
  return undefined;
}

function teamOptions(session: Exclude<Awaited<ReturnType<typeof requirePortalSession>>, NextResponse>) {
  return {
    actorStoreId: session.role === 'store' ? session.storeId : undefined,
    canAssignStoreAdmin: session.role === 'super',
  };
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
    return NextResponse.json({
      members,
      canAssignStoreAdmin: session.role === 'super',
    });
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
    accessLevel?: AccessLevel;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const storeId = session.role === 'store' ? session.storeId : body.storeId;
  if (!storeId || !body.displayName?.trim() || !body.staffPin?.trim()) {
    return NextResponse.json({ error: '請填寫姓名、PIN 與分店' }, { status: 400 });
  }

  try {
    await createTeamMember(
      storeId,
      {
        displayName: body.displayName,
        staffPin: body.staffPin,
        adminPassword: body.adminPassword,
        accessLevel: body.accessLevel ?? 'staff',
      },
      teamOptions(session),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '建立失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (session.role === 'staff') {
    return NextResponse.json({ error: '師傅無法管理人員' }, { status: 403 });
  }

  let body: {
    updates?: Array<{
      staffId: string;
      displayName?: string;
      staffPin?: string;
      adminPassword?: string;
      accessLevel: AccessLevel;
      storeIds?: StoreSlug[];
    }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.updates?.length) {
    return NextResponse.json({ error: '沒有要儲存的變更' }, { status: 400 });
  }

  try {
    await batchUpdateTeamMembers(
      body.updates.map((u) => ({
        ...u,
        storeIds: session.role === 'super' ? u.storeIds : undefined,
      })),
      teamOptions(session),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '儲存失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

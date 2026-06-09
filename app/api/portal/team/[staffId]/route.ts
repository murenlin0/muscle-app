import { NextResponse } from 'next/server';
import { requirePortalSession } from '@/lib/portal-api';
import { updateTeamMember, type TeamPermission } from '@/lib/team-server';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ staffId: string }> },
) {
  const session = await requirePortalSession();
  if (session instanceof NextResponse) return session;
  if (session.role === 'staff') {
    return NextResponse.json({ error: '師傅無法管理人員' }, { status: 403 });
  }

  const { staffId } = await context.params;

  let body: {
    displayName?: string;
    isActive?: boolean;
    staffPin?: string;
    adminPassword?: string;
    permissions?: TeamPermission[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await updateTeamMember(
      staffId,
      body,
      session.role === 'store' ? session.storeId : undefined,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '更新失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

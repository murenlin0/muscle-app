import { NextResponse } from 'next/server';
import { requireReportsAccess } from '@/lib/portal-api';
import { listLedgerStaffNames } from '@/lib/staff-auth-server';
import { isStoreSlug, type StoreSlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeParam = url.searchParams.get('store') as StoreSlug | null;

  if (!storeParam || !isStoreSlug(storeParam)) {
    return NextResponse.json({ error: '請提供有效的 store 參數' }, { status: 400 });
  }

  const session = await requireReportsAccess(storeParam);
  if (session instanceof NextResponse) return session;

  if (session.role === 'store' && !session.storeIds.includes(storeParam)) {
    return NextResponse.json({ error: '無權查看其他分店' }, { status: 403 });
  }

  try {
    const names = await listLedgerStaffNames(storeParam);
    return NextResponse.json({ names });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入人員選項';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

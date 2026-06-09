import { NextResponse } from 'next/server';
import { portalJson, requireReportsAccess } from '@/lib/portal-api';

export const dynamic = 'force-dynamic';
import { getFinancialOverview } from '@/lib/financial-summary-server';
import type { StoreSlug } from '@/lib/stores';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const storeParam = url.searchParams.get('store') as StoreSlug | null;

  if (!from || !to) {
    return NextResponse.json({ error: '請提供 from、to（YYYY-MM-DD）' }, { status: 400 });
  }

  const session = await requireReportsAccess(storeParam ?? undefined);
  if (session instanceof NextResponse) return session;

  const storeId =
    session.role === 'store' ? session.storeId : storeParam ?? 'store1';

  if (session.role === 'store' && storeParam && storeParam !== session.storeId) {
    return NextResponse.json({ error: '無權查看其他分店' }, { status: 403 });
  }

  try {
    const overview = await getFinancialOverview(from, to, storeId);
    return portalJson({ overview });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入財務總覽';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

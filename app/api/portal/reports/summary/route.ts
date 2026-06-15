import { NextResponse } from 'next/server';
import { requireReportsAccess } from '@/lib/portal-api';
import { listDailyTransactions, revenueTotalFromRows } from '@/lib/reports-server';
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

  if (session.role === 'store' && storeParam && !session.storeIds.includes(storeParam)) {
    return NextResponse.json({ error: '無權查看其他分店' }, { status: 403 });
  }

  const storeId =
    session.role === 'store' ? (storeParam ?? session.storeId) : storeParam ?? undefined;

  try {
    const report = await listDailyTransactions(from, to, storeId);
    const summary = {
      from,
      to,
      storeId: storeId ?? 'all',
      totalRevenue: revenueTotalFromRows(report.rows),
      transactionCount: report.totalRows,
      latestRecordDate: report.latestRecordDate,
    };
    return NextResponse.json({ summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入報表';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

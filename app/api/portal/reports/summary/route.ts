import { NextResponse } from 'next/server';
import { parseReportStoreParam, requireReportsAccess, resolveReportStoreId } from '@/lib/portal-api';
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

  const session = await requireReportsAccess(parseReportStoreParam(storeParam) ?? undefined);
  if (session instanceof NextResponse) return session;

  const resolved = resolveReportStoreId(session, storeParam);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const storeId = resolved.storeId;

  try {
    const report = await listDailyTransactions(from, to, storeId);
    const summary = {
      from,
      to,
      storeId,
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

import { NextResponse } from 'next/server';
import { syncDailyTransactionsToNotion } from '@/lib/notion-daily-export';
import { parseReportStoreParam, portalJson, requireReportsAccess, resolveReportStoreId } from '@/lib/portal-api';
import { isStoreSlug, type StoreSlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await requireReportsAccess();
  if (session instanceof NextResponse) return session;

  let body: {
    storeId?: StoreSlug;
    from?: string;
    to?: string;
    dryRun?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const resolved = resolveReportStoreId(session, body.storeId ?? null);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  if (body.storeId && !isStoreSlug(body.storeId)) {
    return NextResponse.json({ error: '無效的 storeId' }, { status: 400 });
  }

  const from = body.from?.trim() || undefined;
  const to = body.to?.trim() || undefined;
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: 'from 格式須為 YYYY-MM-DD' }, { status: 400 });
  }
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'to 格式須為 YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const result = await syncDailyTransactionsToNotion(resolved.storeId, {
      from,
      to,
      dryRun: Boolean(body.dryRun),
    });
    return portalJson({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : '同步至 Notion 失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

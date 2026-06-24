import { NextResponse } from 'next/server';
import {
  actorFromSession,
  listLedgerEdits,
} from '@/lib/ledger-edit-history-server';
import { parseReportStoreParam, portalJson, requireReportsAccess, resolveReportStoreId } from '@/lib/portal-api';
import type { StoreSlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeParam = url.searchParams.get('store') as StoreSlug | null;
  const limitParam = url.searchParams.get('limit');

  const session = await requireReportsAccess(parseReportStoreParam(storeParam) ?? undefined);
  if (session instanceof NextResponse) return session;

  const resolved = resolveReportStoreId(session, storeParam);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 80, 1), 200) : 80;

  try {
    const [edits, tableReady] = await Promise.all([
      listLedgerEdits(resolved.storeId, limit),
      isLedgerEditTableReady(),
    ]);
    return portalJson({ edits, tableReady });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入編輯紀錄';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

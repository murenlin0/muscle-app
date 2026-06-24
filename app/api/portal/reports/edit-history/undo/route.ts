import { NextResponse } from 'next/server';
import {
  actorFromSession,
  undoLatestLedgerEdit,
} from '@/lib/ledger-edit-history-server';
import { parseReportStoreParam, portalJson, requireReportsAccess, resolveReportStoreId } from '@/lib/portal-api';
import type { StoreSlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await requireReportsAccess();
  if (session instanceof NextResponse) return session;

  let body: { storeId?: StoreSlug };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const resolved = resolveReportStoreId(session, body.storeId ?? null);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  try {
    const result = await undoLatestLedgerEdit(resolved.storeId, actorFromSession(session));
    return portalJson({
      ok: true,
      undoneEditId: result.edit.id,
      summary: result.edit.summary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '復原失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

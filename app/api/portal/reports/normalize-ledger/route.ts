import { NextResponse } from 'next/server';
import { migrateLedgerData } from '@/lib/ledger-migrate-server';
import { requireReportsAccess } from '@/lib/portal-api';
import type { StoreSlug } from '@/lib/stores';

export async function POST(request: Request) {
  const session = await requireReportsAccess();
  if (session instanceof NextResponse) return session;

  let body: { storeId?: StoreSlug } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  if (session.role === 'store' && body.storeId && !session.storeIds.includes(body.storeId)) {
    return NextResponse.json({ error: '無權操作其他分店' }, { status: 403 });
  }

  const storeId =
    session.role === 'store' ? session.storeId : body.storeId ?? 'store1';

  try {
    const report = await migrateLedgerData(storeId);
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    const message = e instanceof Error ? e.message : '資料正規化失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireReportsAccess } from '@/lib/portal-api';
import { listDailyTransactions } from '@/lib/reports-server';
import type { TransactionCategory } from '@/lib/transaction-category';
import { TRANSACTION_CATEGORIES } from '@/lib/transaction-category';
import type { StoreSlug } from '@/lib/stores';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const storeParam = url.searchParams.get('store') as StoreSlug | null;
  const categoryParam = url.searchParams.get('category');

  if (!from || !to) {
    return NextResponse.json({ error: '請提供 from、to（YYYY-MM-DD）' }, { status: 400 });
  }

  const session = await requireReportsAccess(storeParam ?? undefined);
  if (session instanceof NextResponse) return session;

  const storeId =
    session.role === 'store' ? session.storeId : storeParam ?? undefined;

  if (session.role === 'store' && storeParam && storeParam !== session.storeId) {
    return NextResponse.json({ error: '無權查看其他分店' }, { status: 403 });
  }

  const category =
    categoryParam &&
    (TRANSACTION_CATEGORIES as readonly string[]).includes(categoryParam)
      ? (categoryParam as TransactionCategory)
      : undefined;

  try {
    const report = await listDailyTransactions(from, to, storeId, category);
    return NextResponse.json({ report });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入報表';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

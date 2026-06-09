import { NextResponse } from 'next/server';
import { portalJson, requireReportsAccess } from '@/lib/portal-api';

export const dynamic = 'force-dynamic';
import { createDailyTransaction } from '@/lib/daily-transactions-server';
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
    return portalJson({ report });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入報表';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireReportsAccess();
  if (session instanceof NextResponse) return session;

  let body: {
    storeId?: StoreSlug;
    occurredOn?: string;
    title?: string;
    amount?: number;
    category?: TransactionCategory;
    paymentMethods?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const storeId =
    session.role === 'store' ? session.storeId : body.storeId ?? 'store1';

  if (!body.occurredOn || !body.title?.trim()) {
    return NextResponse.json({ error: '請填寫日期與標題' }, { status: 400 });
  }

  if (!body.category || !(TRANSACTION_CATEGORIES as readonly string[]).includes(body.category)) {
    return NextResponse.json({ error: '請選擇類型' }, { status: 400 });
  }

  try {
    const id = await createDailyTransaction(storeId, {
      occurredOn: body.occurredOn,
      title: body.title,
      amount: Number(body.amount) || 0,
      category: body.category,
      paymentMethods: body.paymentMethods ?? [],
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const message = e instanceof Error ? e.message : '新增失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

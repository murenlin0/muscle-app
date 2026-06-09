import { NextResponse } from 'next/server';
import { requireReportsAccess } from '@/lib/portal-api';
import {
  deleteDailyTransaction,
  updateDailyTransaction,
} from '@/lib/daily-transactions-server';
import type { TransactionCategory } from '@/lib/transaction-category';
import { TRANSACTION_CATEGORIES } from '@/lib/transaction-category';
import type { StoreSlug } from '@/lib/stores';

function resolveStoreId(
  session: Exclude<Awaited<ReturnType<typeof requireReportsAccess>>, NextResponse>,
  storeParam: StoreSlug | null,
): StoreSlug {
  if (session.role === 'store') return session.storeId;
  return storeParam ?? 'store1';
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await requireReportsAccess();
  if (session instanceof NextResponse) return session;

  let body: {
    storeId?: StoreSlug;
    occurredOn?: string;
    title?: string;
    amount?: number;
    category?: TransactionCategory;
    paymentMethods?: string[];
    staffName?: string | null;
    clientName?: string | null;
    clientPhone?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const storeId = resolveStoreId(session, body.storeId ?? null);

  if (body.category && !(TRANSACTION_CATEGORIES as readonly string[]).includes(body.category)) {
    return NextResponse.json({ error: '無效的類型' }, { status: 400 });
  }

  try {
    await updateDailyTransaction(id, storeId, {
      occurredOn: body.occurredOn,
      title: body.title,
      amount: body.amount,
      category: body.category,
      paymentMethods: body.paymentMethods,
      staffName: body.staffName,
      clientName: body.clientName,
      clientPhone: body.clientPhone,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '更新失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await requireReportsAccess();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const storeParam = url.searchParams.get('store') as StoreSlug | null;
  const storeId = resolveStoreId(session, storeParam);

  try {
    await deleteDailyTransaction(id, storeId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '刪除失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

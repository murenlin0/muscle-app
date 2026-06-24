import { NextResponse } from 'next/server';
import { parseReportStoreParam, portalJson, requireReportsAccess, resolveReportStoreId } from '@/lib/portal-api';

export const dynamic = 'force-dynamic';
import {
  actorFromSession,
  createDailyTransactionWithLog,
} from '@/lib/ledger-edit-history-server';
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
  const categoriesParam = url.searchParams.get('categories');
  const pageParam = url.searchParams.get('page');
  const pageSizeParam = url.searchParams.get('pageSize');
  const clientPhoneParam = url.searchParams.get('clientPhone');
  const staffNameParam = url.searchParams.get('staffName');
  const accountParam = url.searchParams.get('account');
  const skipMeta = url.searchParams.get('meta') === '0';
  const mode = pageParam !== null ? 'page' as const : 'all' as const;

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

  const category =
    categoryParam &&
    (TRANSACTION_CATEGORIES as readonly string[]).includes(categoryParam)
      ? (categoryParam as TransactionCategory)
      : undefined;

  const categories = categoriesParam
    ? categoriesParam
        .split(',')
        .map((c) => c.trim())
        .filter((c): c is TransactionCategory =>
          (TRANSACTION_CATEGORIES as readonly string[]).includes(c),
        )
    : undefined;

  const categoryFilter =
    categories && categories.length > 0 ? categories : category;

  const ledgerAccount =
    accountParam === '現金' || accountParam === '富邦' ? accountParam : undefined;

  try {
    const report = await listDailyTransactions(from, to, storeId, categoryFilter, {
      mode,
      page: pageParam !== null ? Number(pageParam) : undefined,
      pageSize: pageSizeParam ? Number(pageSizeParam) : undefined,
      clientPhone: clientPhoneParam ?? undefined,
      staffName: staffNameParam?.trim() || undefined,
      ledgerAccount,
      includeVipPhones: !skipMeta,
      skipMeta,
    });
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
    staffName?: string | null;
    clientName?: string | null;
    clientPhone?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const storeId =
    session.role === 'store'
      ? session.storeId
      : parseReportStoreParam(body.storeId);

  if (!storeId) {
    return NextResponse.json({ error: '請提供 storeId' }, { status: 400 });
  }

  if (!body.occurredOn || !body.title?.trim()) {
    return NextResponse.json({ error: '請填寫日期與標題' }, { status: 400 });
  }

  if (!body.category || !(TRANSACTION_CATEGORIES as readonly string[]).includes(body.category)) {
    return NextResponse.json({ error: '請選擇類型' }, { status: 400 });
  }

  try {
    const { id } = await createDailyTransactionWithLog(
      storeId,
      {
        occurredOn: body.occurredOn,
        title: body.title,
        amount: Number(body.amount) || 0,
        category: body.category,
        paymentMethods: body.paymentMethods ?? [],
        staffName: body.staffName,
        clientName: body.clientName,
        clientPhone: body.clientPhone,
      },
      actorFromSession(session),
    );
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const message = e instanceof Error ? e.message : '新增失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

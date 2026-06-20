import { NextResponse } from 'next/server';
import { parseReportStoreParam, requireReportsAccess } from '@/lib/portal-api';
import { listActiveStaffForRoster } from '@/lib/staff-auth-server';
import { computeReportAnswer } from '@/lib/reports-ai-answers';
import {
  asksAllStoresReport,
  extractReportQuery,
  intentSkipsLedgerFilter,
  isReportsAiConfigured,
  ReportsAiError,
  type ReportQueryIntent,
} from '@/lib/reports-ai';
import { SERVICE_HOURS_CATEGORIES } from '@/lib/service-hours';
import type { TransactionCategory } from '@/lib/transaction-category';
import type { StoreSlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { question?: string; store?: StoreSlug };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: '請輸入問題' }, { status: 400 });
  }

  if (!isReportsAiConfigured()) {
    return NextResponse.json(
      { error: 'AI 尚未啟用，請設定 GROQ_API_KEY' },
      { status: 400 },
    );
  }

  const session = await requireReportsAccess(parseReportStoreParam(body.store) ?? undefined);
  if (session instanceof NextResponse) return session;

  try {
    const roster = await listActiveStaffForRoster();
    const intent = await extractReportQuery(question, roster);

    if (intent.blocked) {
      return NextResponse.json({
        filter: null,
        intent,
        answer: intent.blockedMessage ?? '僅支援查詢與統計，無法修改、新增或刪除資料。',
      });
    }

    const wantsAllStores = asksAllStoresReport(question);

    let store: StoreSlug | undefined;
    if (session.role === 'store') {
      const allowed = session.storeIds;
      if (intent.store && !allowed.includes(intent.store)) {
        return NextResponse.json({ error: '無權查看其他分店' }, { status: 403 });
      }
      store = intent.store ?? session.storeId;
    } else if (wantsAllStores) {
      store = intent.store ?? undefined;
    } else {
      store = intent.store ?? parseReportStoreParam(body.store) ?? undefined;
      if (!store && !wantsAllStores) {
        return NextResponse.json({ error: '請指定分店' }, { status: 400 });
      }
    }

    const allowAllStores = wantsAllStores && !store;
    const filter = buildFilter(intent, store, allowAllStores);
    const answer = await computeReportAnswer(intent, store, allowAllStores);

    return NextResponse.json({ filter, intent, answer });
  } catch (e) {
    if (e instanceof ReportsAiError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : 'AI 查詢失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildFilter(
  intent: ReportQueryIntent,
  store: StoreSlug | undefined,
  allowAllStores: boolean,
) {
  const isStaffHours = intent.intent === 'staff_hours';
  const serviceHourCategories: TransactionCategory[] = [...SERVICE_HOURS_CATEGORIES];

  if (intentSkipsLedgerFilter(intent.intent) && intent.intent !== 'filter') {
    return {
      from: intent.from,
      to: intent.to,
      store: allowAllStores ? null : (store ?? null),
      staffName: null,
      categories: null,
      account: null,
    };
  }

  return {
    from: intent.from,
    to: intent.to,
    store: allowAllStores && !store ? null : (store ?? null),
    staffName: isStaffHours ? null : intent.staffName,
    categories: isStaffHours ? serviceHourCategories : intent.categories,
    account: isStaffHours ? null : intent.account,
  };
}

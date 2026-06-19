import { NextResponse } from 'next/server';
import { parseReportStoreParam, requireReportsAccess } from '@/lib/portal-api';
import { listActiveStaffForRoster } from '@/lib/staff-auth-server';
import { listDailyTransactions } from '@/lib/reports-server';
import {
  asksAllStoresReport,
  extractReportQuery,
  isReportsAiConfigured,
  ReportsAiError,
  type ReportQueryIntent,
} from '@/lib/reports-ai';
import {
  computeServiceHours,
  formatServiceHours,
  minutesFromTitle,
  SERVICE_HOURS_CATEGORIES,
} from '@/lib/service-hours';
import type { TransactionCategory } from '@/lib/transaction-category';
import { getStore, type StoreSlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('zh-TW')}`;
}

function staffMatches(rowStaff: string | null, target: string): boolean {
  if (!rowStaff) return false;
  const a = rowStaff.trim();
  const b = target.trim();
  return a === b || a.includes(b) || b.includes(a);
}

/** 從標題解析服務分鐘數，例如「仁60分王小明0912…」→ 60 */
function titleMinutes(title: string): number {
  return minutesFromTitle(title) ?? 0;
}

const SERVICE_CATEGORIES = ['一般消費', '會員使用', '會員補差額'] as const;

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
    const wantsAllStores = asksAllStoresReport(question);

    // 權限：店家帳號只能查自己分店；其餘預設沿用畫面目前分店
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
      if (!store) {
        return NextResponse.json({ error: '請指定分店' }, { status: 400 });
      }
    }

    const isStaffHours = intent.intent === 'staff_hours';
    const serviceHourCategories: TransactionCategory[] = [...SERVICE_HOURS_CATEGORIES];
    const filter = {
      from: intent.from,
      to: intent.to,
      store: wantsAllStores && !store ? null : (store ?? null),
      staffName: isStaffHours ? null : intent.staffName,
      categories: isStaffHours ? serviceHourCategories : intent.categories,
      account: isStaffHours ? null : intent.account,
    };

    const answer = await computeAnswer(intent, store, wantsAllStores && !store);

    return NextResponse.json({ filter, intent, answer });
  } catch (e) {
    if (e instanceof ReportsAiError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : 'AI 查詢失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function computeAnswer(
  intent: ReportQueryIntent,
  store: StoreSlug | undefined,
  allowAllStores: boolean,
): Promise<string> {
  const storeLabel = store ? getStore(store)?.name ?? store : '全部分店';
  const range = `${intent.from} ~ ${intent.to}`;
  const listOptions = {
    mode: 'all' as const,
    skipMeta: false,
    includeVipPhones: false,
    allowAllStores,
  };

  // salary：估算師傅薪資（依服務時長 × 時薪）
  if (intent.intent === 'salary') {
    if (!intent.staffName) {
      return '無法估算薪資：未指定師傅，請說明是哪位師傅。';
    }
    if (!intent.hourlyRate) {
      return '無法估算薪資：未提供時薪，例如「時薪 650」。';
    }
    const report = await listDailyTransactions(
      intent.from,
      intent.to,
      store,
      [...SERVICE_CATEGORIES],
      { ...listOptions },
    );
    const rows = report.rows.filter((r) => staffMatches(r.staffName, intent.staffName!));
    if (!rows.length) {
      return `在 ${range}（${storeLabel}）找不到「${intent.staffName}」的服務紀錄，無法估算薪資。`;
    }

    let totalMinutes = 0;
    let beforeMinutes = 0;
    let afterMinutes = 0;
    for (const r of rows) {
      const mins = titleMinutes(r.title);
      totalMinutes += mins;
      if (intent.rateEffectiveFrom && intent.priorRate) {
        if (r.occurredOn >= intent.rateEffectiveFrom) afterMinutes += mins;
        else beforeMinutes += mins;
      }
    }
    const totalHours = totalMinutes / 60;

    if (intent.rateEffectiveFrom && intent.priorRate) {
      const beforePay = (beforeMinutes / 60) * intent.priorRate;
      const afterPay = (afterMinutes / 60) * intent.hourlyRate;
      const total = beforePay + afterPay;
      return [
        `「${intent.staffName}」薪資估算（${range}，${storeLabel}）：`,
        `· ${intent.rateEffectiveFrom} 前：${(beforeMinutes / 60).toFixed(1)} 小時 × ${fmtMoney(intent.priorRate)} = ${fmtMoney(beforePay)}`,
        `· ${intent.rateEffectiveFrom} 起：${(afterMinutes / 60).toFixed(1)} 小時 × ${fmtMoney(intent.hourlyRate)} = ${fmtMoney(afterPay)}`,
        `· 合計約 ${fmtMoney(total)}（共 ${rows.length} 筆服務、${totalHours.toFixed(1)} 小時）`,
        `※ 工時依帳目標題的「分鐘數」推算，僅供參考。`,
      ].join('\n');
    }

    const pay = totalHours * intent.hourlyRate;
    return [
      `「${intent.staffName}」薪資估算（${range}，${storeLabel}）：`,
      `· ${totalHours.toFixed(1)} 小時 × ${fmtMoney(intent.hourlyRate)} = 約 ${fmtMoney(pay)}`,
      `· 共 ${rows.length} 筆服務`,
      `※ 工時依帳目標題的「分鐘數」推算，僅供參考。`,
    ].join('\n');
  }

  // staff_hours：依師傅分組加總服務時數
  if (intent.intent === 'staff_hours') {
    const report = await listDailyTransactions(
      intent.from,
      intent.to,
      store,
      [...SERVICE_HOURS_CATEGORIES],
      { ...listOptions },
    );

    const byStaff = new Map<string, number>();
    for (const r of report.rows) {
      const hours = computeServiceHours(r.title, r.category);
      if (hours == null) continue;
      const name = r.staffName?.trim() || '（未指定）';
      byStaff.set(name, (byStaff.get(name) ?? 0) + hours);
    }

    if (!byStaff.size) {
      return `${storeLabel}，${range}，各師傅服務時數（一般消費、會員使用）\n此期間無可計算時數的服務紀錄。`;
    }

    const entries = [...byStaff.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], 'zh-Hant');
    });

    const totalHours = entries.reduce((sum, [, hours]) => sum + hours, 0);
    const lines = entries.map(
      ([name, hours]) => `· ${name}：${formatServiceHours(hours)} 小時`,
    );

    return [
      `${storeLabel}，${range}，各師傅服務時數（一般消費、會員使用）：`,
      ...lines,
      `合計 ${formatServiceHours(totalHours)} 小時`,
    ].join('\n');
  }

  // sum / count / filter：套用篩選後聚合
  const report = await listDailyTransactions(
    intent.from,
    intent.to,
    store,
    intent.categories ?? undefined,
    {
      ...listOptions,
      ledgerAccount: intent.account ?? undefined,
    },
  );

  let rows = report.rows;
  if (intent.staffName) {
    rows = rows.filter((r) => staffMatches(r.staffName, intent.staffName!));
  }

  const count = rows.length;
  const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const catLabel = intent.categories?.length ? `分類：${intent.categories.join('、')}` : '全部分類';
  const staffLabel = intent.staffName ? `、師傅：${intent.staffName}` : '';
  const accountLabel = intent.account ? `、帳戶：${intent.account}` : '';
  const scope = `${storeLabel}，${range}，${catLabel}${staffLabel}${accountLabel}`;

  if (intent.intent === 'count') {
    return `${scope}\n共 ${count.toLocaleString('zh-TW')} 筆。`;
  }

  // sum 或 filter 都附上總額
  return `${scope}\n共 ${count.toLocaleString('zh-TW')} 筆，金額合計 ${fmtMoney(total)}。`;
}

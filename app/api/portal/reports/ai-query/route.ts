import { NextResponse } from 'next/server';
import { requireReportsAccess } from '@/lib/portal-api';
import { listActiveStaffForRoster } from '@/lib/staff-auth-server';
import { listDailyTransactions } from '@/lib/reports-server';
import {
  extractReportQuery,
  isReportsAiConfigured,
  ReportsAiError,
  type ReportQueryIntent,
} from '@/lib/reports-ai';
import type { StoreSlug } from '@/lib/stores';
import { getStore } from '@/lib/stores';

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
function minutesFromTitle(title: string): number {
  const m = title.match(/(\d{2,3})\s*分/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
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

  const session = await requireReportsAccess(body.store ?? undefined);
  if (session instanceof NextResponse) return session;

  try {
    const roster = await listActiveStaffForRoster();
    const intent = await extractReportQuery(question, roster);

    // 權限：店家帳號只能查自己分店
    let store = intent.store;
    if (session.role === 'store') {
      const allowed = session.storeIds;
      if (store && !allowed.includes(store)) {
        return NextResponse.json({ error: '無權查看其他分店' }, { status: 403 });
      }
      store = store ?? session.storeId;
    }

    const filter = {
      from: intent.from,
      to: intent.to,
      store: store ?? null,
      staffName: intent.staffName,
      categories: intent.categories,
      account: intent.account,
    };

    const answer = await computeAnswer(intent, store ?? undefined);

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
): Promise<string> {
  const storeLabel = store ? getStore(store)?.name ?? store : '全部分店';
  const range = `${intent.from} ~ ${intent.to}`;

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
      { mode: 'all', skipMeta: false, includeVipPhones: false },
    );
    const rows = report.rows.filter((r) => staffMatches(r.staffName, intent.staffName!));
    if (!rows.length) {
      return `在 ${range}（${storeLabel}）找不到「${intent.staffName}」的服務紀錄，無法估算薪資。`;
    }

    let totalMinutes = 0;
    let beforeMinutes = 0;
    let afterMinutes = 0;
    for (const r of rows) {
      const mins = minutesFromTitle(r.title);
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

  // sum / count / filter：套用篩選後聚合
  const report = await listDailyTransactions(
    intent.from,
    intent.to,
    store,
    intent.categories ?? undefined,
    {
      mode: 'all',
      skipMeta: false,
      includeVipPhones: false,
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

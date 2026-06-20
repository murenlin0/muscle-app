import { getFinancialOverview, type ExpenseBreakdown, type FinancialOverview } from '@/lib/financial-summary-server';
import { resolveClientFromFields } from '@/lib/ledger-client-display';
import { categoryShowsClient } from '@/lib/ledger-client-detect';
import {
  clientMemberBalance,
  type MemberBalanceRow,
} from '@/lib/ledger-title-balance';
import { listDailyTransactions, getVipMemberPhones } from '@/lib/reports-server';
import type { ReportQueryIntent } from '@/lib/reports-ai';
import {
  computeServiceHours,
  formatServiceHours,
  minutesFromTitle,
  SERVICE_HOURS_CATEGORIES,
} from '@/lib/service-hours';
import { getStore, STORE_LIST, type StoreSlug } from '@/lib/stores';
import { isRevenueCategory, type TransactionCategory } from '@/lib/transaction-category';

const SERVICE_CATEGORIES = ['一般消費', '會員使用', '會員補差額'] as const;

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('zh-TW')}`;
}

function staffMatches(rowStaff: string | null, target: string): boolean {
  if (!rowStaff) return false;
  const a = rowStaff.trim();
  const b = target.trim();
  return a === b || a.includes(b) || b.includes(a);
}

function titleMinutes(title: string): number {
  return minutesFromTitle(title) ?? 0;
}

function formatBreakdown(b: ExpenseBreakdown): string {
  const lines: string[] = [];
  const items: Array<[keyof ExpenseBreakdown, string]> = [
    ['房租', '房租'],
    ['水電', '水電'],
    ['師傅薪水', '師傅薪水'],
    ['添購', '添購'],
    ['廣告', '廣告'],
    ['其他', '其他'],
  ];
  for (const [key, label] of items) {
    if (b[key] > 0) lines.push(`· ${label}：${fmtMoney(b[key])}`);
  }
  return lines.length ? lines.join('\n') : '· 此期間無支出明細';
}

function formatOverview(o: FinancialOverview, storeLabel: string, range: string, focus: 'full' | 'profit' | 'assets'): string {
  const { assets, incomeStatement: pnl } = o;
  if (focus === 'profit') {
    return [
      `${storeLabel}，${range}，損益概覽：`,
      `· 營業額：${fmtMoney(pnl.totalIncome)}`,
      `· 成本：${fmtMoney(pnl.totalExpense)}`,
      `· 淨利：${fmtMoney(pnl.netProfit)}`,
    ].join('\n');
  }
  if (focus === 'assets') {
    return [
      `${storeLabel}，截至 ${o.to} 資產概覽：`,
      `· 店內現金：${fmtMoney(assets.cashOnHand)}`,
      `· 富邦帳戶：${fmtMoney(assets.bankAccounts)}`,
      `· 現金＋富邦：${fmtMoney(assets.cashOnHand + assets.bankAccounts)}`,
      `· 會員餘額未使用：${fmtMoney(assets.unusedMemberBalance)}`,
      assets.accountsReceivable > 0
        ? `· 應收（未收款）：${fmtMoney(assets.accountsReceivable)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return [
    `${storeLabel}，${range}，財務總覽：`,
    '',
    '【損益】',
    `· 營業額：${fmtMoney(pnl.totalIncome)}`,
    `· 成本：${fmtMoney(pnl.totalExpense)}`,
    `· 淨利：${fmtMoney(pnl.netProfit)}`,
    '',
    '【成本明細】',
    formatBreakdown(pnl.expenseBreakdown),
    '',
    '【資產（截至 ' + o.to + '）】',
    `· 店內現金：${fmtMoney(assets.cashOnHand)}`,
    `· 富邦帳戶：${fmtMoney(assets.bankAccounts)}`,
    `· 會員餘額未使用：${fmtMoney(assets.unusedMemberBalance)}`,
  ].join('\n');
}

async function fetchOverviewForScope(
  from: string,
  to: string,
  store: StoreSlug | undefined,
  allowAllStores: boolean,
): Promise<{ label: string; overview: FinancialOverview } | { label: string; overviews: FinancialOverview[] }> {
  if (allowAllStores || !store) {
    const overviews = await Promise.all(
      STORE_LIST.map((s) => getFinancialOverview(from, to, s.slug)),
    );
    return { label: '全部分店', overviews };
  }
  const overview = await getFinancialOverview(from, to, store);
  return { label: getStore(store)?.name ?? store, overview };
}

function aggregateOverviews(overviews: FinancialOverview[]): FinancialOverview {
  const first = overviews[0]!;
  const breakdown: ExpenseBreakdown = { 添購: 0, 房租: 0, 水電: 0, 廣告: 0, 師傅薪水: 0, 其他: 0 };
  let totalIncome = 0;
  let totalExpense = 0;
  let cashOnHand = 0;
  let bankAccounts = 0;
  let unusedMemberBalance = 0;
  let accountsReceivable = 0;

  for (const o of overviews) {
    totalIncome += o.incomeStatement.totalIncome;
    totalExpense += o.incomeStatement.totalExpense;
    cashOnHand += o.assets.cashOnHand;
    bankAccounts += o.assets.bankAccounts;
    unusedMemberBalance += o.assets.unusedMemberBalance;
    accountsReceivable += o.assets.accountsReceivable;
    for (const k of Object.keys(breakdown) as Array<keyof ExpenseBreakdown>) {
      breakdown[k] += o.incomeStatement.expenseBreakdown[k];
    }
  }

  return {
    from: first.from,
    to: first.to,
    storeId: first.storeId,
    assets: {
      total: cashOnHand + bankAccounts,
      cashOnHand,
      bankAccounts,
      unusedMemberBalance,
      deferredRevenue: unusedMemberBalance,
      accountsReceivable,
    },
    incomeStatement: {
      totalIncome,
      serviceIncome: totalIncome,
      subleaseIncome: 0,
      totalExpense,
      expenseBreakdown: breakdown,
      netProfit: totalIncome - totalExpense,
    },
    shareholders: [],
  };
}

function previousPeriod(from: string, to: string): { from: string; to: string } {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((toMs - fromMs) / 86400000) + 1;
  const compareToMs = fromMs - 86400000;
  const compareFromMs = compareToMs - (days - 1) * 86400000;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: fmt(compareFromMs), to: fmt(compareToMs) };
}

async function totalServiceHours(
  from: string,
  to: string,
  store: StoreSlug | undefined,
  allowAllStores: boolean,
): Promise<number> {
  const report = await listDailyTransactions(from, to, store, [...SERVICE_HOURS_CATEGORIES], {
    mode: 'all',
    skipMeta: true,
    includeVipPhones: false,
    allowAllStores,
  });
  let total = 0;
  for (const r of report.rows) {
    const h = computeServiceHours(r.title, r.category);
    if (h != null) total += h;
  }
  return total;
}

function resolveCompareRange(intent: ReportQueryIntent): { from: string; to: string } {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (
    intent.compareFrom &&
    intent.compareTo &&
    dateRe.test(intent.compareFrom) &&
    dateRe.test(intent.compareTo)
  ) {
    return { from: intent.compareFrom, to: intent.compareTo };
  }
  return previousPeriod(intent.from, intent.to);
}

async function computeClientStats(
  intent: ReportQueryIntent,
  store: StoreSlug | undefined,
  allowAllStores: boolean,
): Promise<string> {
  if (!store && !allowAllStores) {
    return '請指定分店以查詢客人統計。';
  }

  const storeLabel = store ? getStore(store)?.name ?? store : '全部分店';
  const mode = intent.clientStatsMode ?? 'no_phone';

  if (mode === 'vip_count') {
    if (allowAllStores || !store) {
      const counts = await Promise.all(STORE_LIST.map((s) => getVipMemberPhones(s.slug)));
      const total = counts.reduce((sum, c) => sum + c.length, 0);
      const lines = STORE_LIST.map((s, i) => `· ${s.name}：${counts[i]!.length.toLocaleString('zh-TW')} 位`);
      return [`${storeLabel} VIP 會員人數：`, ...lines, `合計 ${total.toLocaleString('zh-TW')} 位`].join('\n');
    }
    const phones = await getVipMemberPhones(store);
    return `${storeLabel} 共有 ${phones.length.toLocaleString('zh-TW')} 位 VIP 會員（曾儲值）。`;
  }

  if (mode === 'balance_by_name') {
    const query = intent.clientNameQuery?.trim();
    if (!query) return '請提供客人姓名，例如「王小明餘額多少」。';
    if (!store) return '查詢客人餘額需指定分店。';

    const report = await listDailyTransactions(
      '2000-01-01',
      intent.to,
      store,
      ['會員儲值', '會員使用', '會員補差額'],
      { mode: 'all', skipMeta: true, includeVipPhones: true, allowAllStores: false },
    );

    const memberRows: MemberBalanceRow[] = report.rows.map((r) => ({
      id: r.id,
      occurred_on: r.occurredOn,
      title: r.title,
      amount: r.amount,
      category: r.category,
      client_name: r.clientName,
      client_phone: r.clientPhone,
    }));

    const matchedPhone = new Set<string>();
    for (const r of report.rows) {
      const name = r.clientName?.trim() ?? '';
      if (name && (name.includes(query) || query.includes(name))) {
        if (r.clientPhone) matchedPhone.add(r.clientPhone);
      }
      const identity = resolveClientFromFields(r.title, r.category, r.clientName, r.clientPhone);
      if (identity?.name && (identity.name.includes(query) || query.includes(identity.name))) {
        if (identity.phone) matchedPhone.add(identity.phone);
      }
    }

    if (!matchedPhone.size) {
      return `${storeLabel} 找不到姓名含「${query}」的會員紀錄。`;
    }

    const lines: string[] = [];
    for (const phone of matchedPhone) {
      const bal = clientMemberBalance(memberRows, phone);
      const sample = report.rows.find((r) => r.clientPhone === phone);
      const name = sample?.clientName ?? query;
      lines.push(`· ${name}（${phone}）：餘額 ${bal != null ? fmtMoney(bal) : '—'}`);
    }
    return [`${storeLabel} 客人餘額查詢：`, ...lines].join('\n');
  }

  // no_phone：無電話客人（依姓名去重）
  const report = await listDailyTransactions(
    intent.from,
    intent.to,
    store,
    undefined,
    { mode: 'all', skipMeta: true, includeVipPhones: false, allowAllStores },
  );

  const names = new Set<string>();
  for (const r of report.rows) {
    const cat = r.category as TransactionCategory;
    if (!categoryShowsClient(cat)) continue;
    const identity = resolveClientFromFields(r.title, cat, r.clientName, r.clientPhone);
    const phone = identity?.phone ?? r.clientPhone?.trim() ?? '';
    if (phone) continue;
    const name = identity?.name ?? r.clientName?.trim();
    if (name) names.add(name);
  }

  const range = `${intent.from} ~ ${intent.to}`;
  if (!names.size) {
    return `${storeLabel}，${range}，沒有電話的客人：0 位。`;
  }
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const preview = sorted.slice(0, 20).map((n) => `· ${n}`).join('\n');
  const more = sorted.length > 20 ? `\n…另有 ${sorted.length - 20} 位` : '';
  return [
    `${storeLabel}，${range}，沒有電話的客人共 ${sorted.length.toLocaleString('zh-TW')} 位：`,
    preview + more,
  ].join('\n');
}

async function computeTopN(
  intent: ReportQueryIntent,
  store: StoreSlug | undefined,
  allowAllStores: boolean,
): Promise<string> {
  const n = intent.topN ?? 5;
  const type = intent.topNType ?? 'staff_hours';
  const storeLabel = store ? getStore(store)?.name ?? store : '全部分店';
  const range = `${intent.from} ~ ${intent.to}`;

  if (type === 'staff_hours') {
    const report = await listDailyTransactions(
      intent.from,
      intent.to,
      store,
      [...SERVICE_HOURS_CATEGORIES],
      { mode: 'all', skipMeta: true, includeVipPhones: false, allowAllStores },
    );
    const byStaff = new Map<string, number>();
    for (const r of report.rows) {
      const h = computeServiceHours(r.title, r.category);
      if (h == null) continue;
      const name = r.staffName?.trim() || '（未指定）';
      byStaff.set(name, (byStaff.get(name) ?? 0) + h);
    }
    const entries = [...byStaff.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))
      .slice(0, n);
    if (!entries.length) return `${storeLabel}，${range}，前 ${n} 名師傅（時數）：此期間無資料。`;
    return [
      `${storeLabel}，${range}，前 ${n} 名師傅（服務時數）：`,
      ...entries.map(([name, h], i) => `${i + 1}. ${name}：${formatServiceHours(h)} 小時`),
    ].join('\n');
  }

  if (type === 'staff_revenue') {
    const report = await listDailyTransactions(
      intent.from,
      intent.to,
      store,
      [...SERVICE_CATEGORIES],
      { mode: 'all', skipMeta: true, includeVipPhones: false, allowAllStores },
    );
    const byStaff = new Map<string, number>();
    for (const r of report.rows) {
      const name = r.staffName?.trim() || '（未指定）';
      byStaff.set(name, (byStaff.get(name) ?? 0) + Math.abs(r.amount ?? 0));
    }
    const entries = [...byStaff.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))
      .slice(0, n);
    if (!entries.length) return `${storeLabel}，${range}，前 ${n} 名師傅（營業額）：此期間無資料。`;
    return [
      `${storeLabel}，${range}，前 ${n} 名師傅（服務營業額）：`,
      ...entries.map(([name, amt], i) => `${i + 1}. ${name}：${fmtMoney(amt)}`),
    ].join('\n');
  }

  // client_revenue / client_visits
  const report = await listDailyTransactions(
    intent.from,
    intent.to,
    store,
    undefined,
    { mode: 'all', skipMeta: true, includeVipPhones: true, allowAllStores },
  );

  const byClient = new Map<string, { label: string; revenue: number; visits: number }>();
  for (const r of report.rows) {
    const cat = r.category as TransactionCategory;
    if (!categoryShowsClient(cat)) continue;
    const identity = resolveClientFromFields(r.title, cat, r.clientName, r.clientPhone);
    if (!identity) continue;
    const key = identity.phone || identity.name;
    const label = identity.phone ? `${identity.name}（${identity.phone}）` : identity.name;
    const cur = byClient.get(key) ?? { label, revenue: 0, visits: 0 };
    if (isRevenueCategory(cat)) cur.revenue += Math.abs(r.amount ?? 0);
    if (cat === '一般消費' || cat === '會員使用' || cat === '會員補差額') cur.visits += 1;
    byClient.set(key, cur);
  }

  const entries = [...byClient.values()].sort((a, b) => {
    const diff = type === 'client_visits' ? b.visits - a.visits : b.revenue - a.revenue;
    return diff || a.label.localeCompare(b.label, 'zh-Hant');
  }).slice(0, n);

  if (!entries.length) {
    return `${storeLabel}，${range}，前 ${n} 名客人：此期間無資料。`;
  }

  const metricLabel = type === 'client_visits' ? '來店次數' : '消費金額';
  return [
    `${storeLabel}，${range}，前 ${n} 名客人（${metricLabel}）：`,
    ...entries.map((e, i) => {
      const val = type === 'client_visits'
        ? `${e.visits.toLocaleString('zh-TW')} 次`
        : fmtMoney(e.revenue);
      return `${i + 1}. ${e.label}：${val}`;
    }),
  ].join('\n');
}

export async function computeReportAnswer(
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

  if (intent.intent === 'overview' || intent.intent === 'net_profit') {
    const scope = await fetchOverviewForScope(intent.from, intent.to, store, allowAllStores);
    const focus = intent.intent === 'net_profit' ? 'profit' : 'full';
    if ('overviews' in scope) {
      const agg = aggregateOverviews(scope.overviews);
      return formatOverview(agg, scope.label, range, focus);
    }
    return formatOverview(scope.overview, scope.label, range, focus);
  }

  if (intent.intent === 'expense_breakdown') {
    const scope = await fetchOverviewForScope(intent.from, intent.to, store, allowAllStores);
    const o = 'overviews' in scope ? aggregateOverviews(scope.overviews) : scope.overview;
    return [
      `${scope.label}，${range}，成本明細（合計 ${fmtMoney(o.incomeStatement.totalExpense)}）：`,
      formatBreakdown(o.incomeStatement.expenseBreakdown),
    ].join('\n');
  }

  if (intent.intent === 'multi_account') {
    const scope = await fetchOverviewForScope(intent.from, intent.to, store, allowAllStores);
    const o = 'overviews' in scope ? aggregateOverviews(scope.overviews) : scope.overview;
    const total = o.assets.cashOnHand + o.assets.bankAccounts;
    return [
      `${scope.label}，截至 ${intent.to} 帳戶加總：`,
      `· 店內現金：${fmtMoney(o.assets.cashOnHand)}`,
      `· 富邦帳戶：${fmtMoney(o.assets.bankAccounts)}`,
      `· 合計：${fmtMoney(total)}`,
    ].join('\n');
  }

  if (intent.intent === 'compare') {
    const prev = resolveCompareRange(intent);
    const metric = intent.compareMetric ?? 'all';
    const curScope = await fetchOverviewForScope(intent.from, intent.to, store, allowAllStores);
    const prevScope = await fetchOverviewForScope(prev.from, prev.to, store, allowAllStores);
    const cur = 'overviews' in curScope ? aggregateOverviews(curScope.overviews) : curScope.overview;
    const prevO = 'overviews' in prevScope ? aggregateOverviews(prevScope.overviews) : prevScope.overview;

    const curHours = metric === 'hours' || metric === 'all'
      ? await totalServiceHours(intent.from, intent.to, store, allowAllStores)
      : 0;
    const prevHours = metric === 'hours' || metric === 'all'
      ? await totalServiceHours(prev.from, prev.to, store, allowAllStores)
      : 0;

    const diff = (a: number, b: number) => {
      const d = a - b;
      const sign = d >= 0 ? '+' : '';
      return `${sign}${fmtMoney(d)}`;
    };
    const diffHours = (a: number, b: number) => {
      const d = a - b;
      const sign = d >= 0 ? '+' : '';
      return `${sign}${formatServiceHours(d)} 小時`;
    };

    const lines: string[] = [
      `${storeLabel} 期間比較：`,
      `· 本期：${range}`,
      `· 對照：${prev.from} ~ ${prev.to}`,
      '',
    ];

    if (metric === 'all' || metric === 'revenue') {
      lines.push(
        `【營業額】`,
        `· 本期 ${fmtMoney(cur.incomeStatement.totalIncome)} / 對照 ${fmtMoney(prevO.incomeStatement.totalIncome)} / 差異 ${diff(cur.incomeStatement.totalIncome, prevO.incomeStatement.totalIncome)}`,
      );
    }
    if (metric === 'all' || metric === 'expense') {
      lines.push(
        `【成本】`,
        `· 本期 ${fmtMoney(cur.incomeStatement.totalExpense)} / 對照 ${fmtMoney(prevO.incomeStatement.totalExpense)} / 差異 ${diff(cur.incomeStatement.totalExpense, prevO.incomeStatement.totalExpense)}`,
      );
    }
    if (metric === 'all' || metric === 'net_profit') {
      lines.push(
        `【淨利】`,
        `· 本期 ${fmtMoney(cur.incomeStatement.netProfit)} / 對照 ${fmtMoney(prevO.incomeStatement.netProfit)} / 差異 ${diff(cur.incomeStatement.netProfit, prevO.incomeStatement.netProfit)}`,
      );
    }
    if (metric === 'all' || metric === 'cash') {
      const curCash = cur.assets.cashOnHand + cur.assets.bankAccounts;
      const prevCash = prevO.assets.cashOnHand + prevO.assets.bankAccounts;
      lines.push(
        `【現金＋富邦（截至各期結束日）】`,
        `· 本期 ${fmtMoney(curCash)} / 對照 ${fmtMoney(prevCash)} / 差異 ${diff(curCash, prevCash)}`,
      );
    }
    if (metric === 'all' || metric === 'hours') {
      lines.push(
        `【服務時數】`,
        `· 本期 ${formatServiceHours(curHours)} 小時 / 對照 ${formatServiceHours(prevHours)} 小時 / 差異 ${diffHours(curHours, prevHours)}`,
      );
    }
    return lines.join('\n');
  }

  if (intent.intent === 'client_stats') {
    return computeClientStats(intent, store, allowAllStores);
  }

  if (intent.intent === 'top_n') {
    return computeTopN(intent, store, allowAllStores);
  }

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

  return `${scope}\n共 ${count.toLocaleString('zh-TW')} 筆，金額合計 ${fmtMoney(total)}。`;
}

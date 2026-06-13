import { getSupabaseAdmin } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabase-paginate';
import { primaryLedgerAccount } from '@/lib/ledger-accounts';
import { sumLedgerAccountBalances } from '@/lib/ledger-balances';
import { sumUnusedMemberBalances, type MemberBalanceRow } from '@/lib/ledger-title-balance';
import type { StoreSlug } from '@/lib/stores';
import {
  isOverviewExpenseCategory,
  isOverviewIncomeCategory,
  type TransactionCategory,
} from '@/lib/transaction-category';

export interface ExpenseBreakdown {
  添購: number;
  房租: number;
  水電: number;
  廣告: number;
  師傅薪水: number;
  其他: number;
}

export interface FinancialOverview {
  from: string;
  to: string;
  storeId: StoreSlug;
  assets: {
    total: number;
    cashOnHand: number;
    bankAccounts: number;
    /** 會員儲值/使用/補差額 signed 加總（逐客人累計後加總） */
    unusedMemberBalance: number;
    /** @deprecated 使用 unusedMemberBalance */
    deferredRevenue: number;
    /** 已服務但尚未收款（不計入總資產） */
    accountsReceivable: number;
  };
  incomeStatement: {
    totalIncome: number;
    serviceIncome: number;
    subleaseIncome: number;
    totalExpense: number;
    expenseBreakdown: ExpenseBreakdown;
    netProfit: number;
  };
  shareholders: Array<{
    id: string;
    name: string;
    ownershipPercent: number;
    dividendDue: number;
    dividendPaid: number;
    dividendUnpaid: number;
  }>;
}

interface TxRow extends MemberBalanceRow {
  id: string;
  occurred_on: string;
}

interface ReceivableRow {
  amount: number;
  category: string;
  payment_methods: string[];
}

function classifyExpense(title: string, category: string): keyof ExpenseBreakdown {
  if (category === '工資') return '師傅薪水';
  const t = title;
  if (/房租|店租|租金/.test(t)) return '房租';
  if (/水電|電費|電信|瓦斯/.test(t)) return '水電';
  if (/廣告|行銷|推廣/.test(t)) return '廣告';
  if (/添購|設備|器材|精油|紙板|用品|採購/.test(t)) return '添購';
  if (/薪資|薪水|支付.*薪/.test(t)) return '師傅薪水';
  return '其他';
}

function emptyBreakdown(): ExpenseBreakdown {
  return { 添購: 0, 房租: 0, 水電: 0, 廣告: 0, 師傅薪水: 0, 其他: 0 };
}

async function fetchBalanceRows(storeId: StoreSlug, to: string): Promise<
  { amount: number; category: string; payment_methods: string[] }[]
> {
  const supabase = getSupabaseAdmin();
  return fetchAllPages(async (offset, pageSize) =>
    supabase
      .from('daily_transactions')
      .select('amount, category, payment_methods')
      .eq('store_id', storeId)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1),
  );
}

async function fetchUnusedBalanceRows(storeId: StoreSlug, to: string): Promise<TxRow[]> {
  const supabase = getSupabaseAdmin();
  return fetchAllPages<TxRow>(async (offset, pageSize) =>
    supabase
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_name, client_phone')
      .eq('store_id', storeId)
      .lte('occurred_on', to)
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1),
  );
}

async function fetchPeriodPnlRows(
  storeId: StoreSlug,
  from: string,
  to: string,
): Promise<{ occurred_on: string; amount: number; category: string; title: string }[]> {
  const supabase = getSupabaseAdmin();
  return fetchAllPages(async (offset, pageSize) =>
    supabase
      .from('daily_transactions')
      .select('occurred_on, amount, category, title')
      .eq('store_id', storeId)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: true })
      .range(offset, offset + pageSize - 1),
  );
}

export async function getFinancialOverview(
  from: string,
  to: string,
  storeId: StoreSlug,
): Promise<FinancialOverview> {
  const [balanceRows, unusedRows, periodRows] = await Promise.all([
    fetchBalanceRows(storeId, to),
    fetchUnusedBalanceRows(storeId, to),
    fetchPeriodPnlRows(storeId, from, to),
  ]);

  const { cashOnHand, bankAccounts } = sumLedgerAccountBalances(balanceRows);

  const unusedMemberBalance = sumUnusedMemberBalances(unusedRows);
  let accountsReceivable = 0;

  for (const row of balanceRows as ReceivableRow[]) {
    const cat = row.category as TransactionCategory;
    const amt = row.amount ?? 0;

    if (
      (cat === '一般消費' || cat === '會員補差額') &&
      !primaryLedgerAccount(row.payment_methods ?? [], cat)
    ) {
      accountsReceivable += Math.abs(amt);
    }
  }
  const totalAssets = cashOnHand + bankAccounts;

  let totalIncome = 0;
  let totalExpense = 0;
  const breakdown = emptyBreakdown();

  for (const row of periodRows) {
    const cat = row.category as TransactionCategory;
    const amt = row.amount ?? 0;

    if (isOverviewIncomeCategory(cat)) {
      totalIncome += Math.abs(amt);
    } else if (isOverviewExpenseCategory(cat)) {
      const expenseAmt = Math.abs(amt);
      totalExpense += expenseAmt;
      breakdown[classifyExpense(row.title, cat)] += expenseAmt;
    } else if (cat === '分紅') {
      breakdown.其他 += Math.abs(amt);
    }
  }

  const serviceIncome = totalIncome;
  const subleaseIncome = 0;
  const netProfit = totalIncome - totalExpense;

  const supabase = getSupabaseAdmin();
  const { data: shareholderRows, error: shError } = await supabase
    .from('shareholders')
    .select('id, name, ownership_percent')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('ownership_percent', { ascending: false });

  if (shError) throw new Error(shError.message);

  const dividendPaidByName = new Map<string, number>();
  for (const row of periodRows) {
    if ((row.category as TransactionCategory) !== '分紅') continue;
    const paid = Math.abs(row.amount ?? 0);
    for (const sh of shareholderRows ?? []) {
      if (row.title.includes(sh.name)) {
        dividendPaidByName.set(sh.name, (dividendPaidByName.get(sh.name) ?? 0) + paid);
      }
    }
  }

  const shareholders = (shareholderRows ?? []).map((sh) => {
    const pct = Number(sh.ownership_percent) || 0;
    const dividendDue = Math.round(Math.max(0, netProfit) * pct);
    const dividendPaid = dividendPaidByName.get(sh.name as string) ?? 0;
    return {
      id: sh.id as string,
      name: sh.name as string,
      ownershipPercent: pct,
      dividendDue,
      dividendPaid,
      dividendUnpaid: dividendDue - dividendPaid,
    };
  });

  return {
    from,
    to,
    storeId,
    assets: {
      total: totalAssets,
      cashOnHand,
      bankAccounts,
      unusedMemberBalance,
      deferredRevenue: unusedMemberBalance,
      accountsReceivable,
    },
    incomeStatement: {
      totalIncome,
      serviceIncome,
      subleaseIncome,
      totalExpense,
      expenseBreakdown: breakdown,
      netProfit,
    },
    shareholders,
  };
}

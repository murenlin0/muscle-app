import { getSupabaseAdmin } from '@/lib/supabase';
import { primaryLedgerAccount } from '@/lib/ledger-accounts';
import type { StoreSlug } from '@/lib/stores';
import {
  isPnlExpenseCategory,
  isPnlIncomeCategory,
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

interface TxRow {
  occurred_on: string;
  amount: number;
  category: string;
  payment_methods: string[];
  title: string;
}

/** 會員使用不動帳戶；其餘依簽帳金額累計帳戶餘額 */
function affectsAccountBalance(category: TransactionCategory): boolean {
  return category !== '會員使用';
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

async function fetchAllRows(storeId: StoreSlug, to: string): Promise<TxRow[]> {
  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  const all: TxRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select('occurred_on, amount, category, payment_methods, title')
      .eq('store_id', storeId)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...(data as TxRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

export async function getFinancialOverview(
  from: string,
  to: string,
  storeId: StoreSlug,
): Promise<FinancialOverview> {
  const all = await fetchAllRows(storeId, to);
  const period = all.filter((r) => r.occurred_on >= from && r.occurred_on <= to);

  let cashOnHand = 0;
  let bankAccounts = 0;
  let memberPrepaid = 0;

  for (const row of all) {
    const cat = row.category as TransactionCategory;
    const amt = row.amount ?? 0;

    if (cat === '會員儲值') memberPrepaid += Math.abs(amt);
    if (cat === '會員使用') memberPrepaid -= Math.abs(amt);

    if (!affectsAccountBalance(cat)) continue;

    const acc = primaryLedgerAccount(row.payment_methods ?? [], cat);
    if (acc === '現金') cashOnHand += amt;
    else if (acc === '富邦') bankAccounts += amt;
  }

  const accountsReceivable = Math.max(0, memberPrepaid);
  // 總資產＝店內現金＋銀行（應收帳款為會員儲值餘額，已含於帳戶現金中）
  const totalAssets = cashOnHand + bankAccounts;

  let serviceIncome = 0;
  let subleaseIncome = 0;
  const breakdown = emptyBreakdown();

  for (const row of period) {
    const cat = row.category as TransactionCategory;
    const amt = row.amount ?? 0;

    if (cat === '收入') {
      subleaseIncome += Math.abs(amt);
    } else if (isPnlIncomeCategory(cat)) {
      serviceIncome += Math.abs(amt);
    } else if (isPnlExpenseCategory(cat)) {
      const expenseAmt = Math.abs(amt);
      if (cat === '支出' || cat === '工資') {
        const key = classifyExpense(row.title, cat);
        breakdown[key] += expenseAmt;
      } else if (cat === '分紅') {
        breakdown.其他 += expenseAmt;
      }
    }
  }

  const totalExpense =
    breakdown.添購 +
    breakdown.房租 +
    breakdown.水電 +
    breakdown.廣告 +
    breakdown.師傅薪水 +
    breakdown.其他;
  const totalIncome = serviceIncome + subleaseIncome;
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
  for (const row of period) {
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

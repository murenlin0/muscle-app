import { getSupabaseAdmin } from '@/lib/supabase';
import type { StoreSlug } from '@/lib/stores';
import type { TransactionCategory } from '@/lib/transaction-category';

const CASH_METHODS = new Set(['現金']);
const BANK_METHODS = new Set(['富邦', 'Line', '街口', '仁中信']);
const INFLOW_CATEGORIES = new Set<TransactionCategory>([
  '一般消費',
  '會員儲值',
  '會員使用',
  '會員補差額',
  '收入',
]);
const OUTFLOW_CATEGORIES = new Set<TransactionCategory>(['支出', '工資', '分紅']);

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
  }>;
}

interface TxRow {
  occurred_on: string;
  amount: number;
  category: string;
  payment_methods: string[];
  title: string;
}

function hasMethod(methods: string[], set: Set<string>): boolean {
  return methods.some((m) => set.has(m));
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

export async function getFinancialOverview(
  from: string,
  to: string,
  storeId: StoreSlug,
): Promise<FinancialOverview> {
  const supabase = getSupabaseAdmin();

  const { data: txRows, error: txError } = await supabase
    .from('daily_transactions')
    .select('occurred_on, amount, category, payment_methods, title')
    .eq('store_id', storeId)
    .lte('occurred_on', to);

  if (txError) throw new Error(txError.message);

  const all = (txRows ?? []) as TxRow[];
  const period = all.filter((r) => r.occurred_on >= from && r.occurred_on <= to);

  let cashOnHand = 0;
  let bankAccounts = 0;
  let accountsReceivable = 0;

  for (const row of all) {
    const methods = row.payment_methods ?? [];
    const cat = row.category as TransactionCategory;
    const amt = row.amount ?? 0;
    const sign = OUTFLOW_CATEGORIES.has(cat) ? -1 : INFLOW_CATEGORIES.has(cat) ? 1 : 0;
    if (sign === 0) continue;

    if (hasMethod(methods, CASH_METHODS)) cashOnHand += amt * sign;
    if (hasMethod(methods, BANK_METHODS)) bankAccounts += amt * sign;
    if (cat === '會員使用' && methods.includes('會員使用')) {
      accountsReceivable += amt;
    }
  }

  accountsReceivable = Math.max(0, accountsReceivable);

  let serviceIncome = 0;
  let subleaseIncome = 0;
  const breakdown = emptyBreakdown();

  for (const row of period) {
    const cat = row.category as TransactionCategory;
    const amt = row.amount ?? 0;

    if (cat === '收入') {
      subleaseIncome += amt;
    } else if (cat === '一般消費' || cat === '會員使用' || cat === '會員補差額') {
      serviceIncome += amt;
    } else if (cat === '會員儲值') {
      serviceIncome += amt;
    } else if (cat === '支出' || cat === '工資') {
      const key = classifyExpense(row.title, cat);
      breakdown[key] += amt;
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
    for (const sh of shareholderRows ?? []) {
      if (row.title.includes(sh.name)) {
        dividendPaidByName.set(
          sh.name,
          (dividendPaidByName.get(sh.name) ?? 0) + row.amount,
        );
      }
    }
  }

  const shareholders = (shareholderRows ?? []).map((sh) => {
    const pct = Number(sh.ownership_percent) || 0;
    return {
      id: sh.id as string,
      name: sh.name as string,
      ownershipPercent: pct,
      dividendDue: Math.round(netProfit * pct),
      dividendPaid: dividendPaidByName.get(sh.name as string) ?? 0,
    };
  });

  return {
    from,
    to,
    storeId,
    assets: {
      total: cashOnHand + bankAccounts + accountsReceivable,
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

import { getSupabaseAdmin } from '@/lib/supabase';
import type { StoreSlug } from '@/lib/stores';
import {
  isRevenueCategory,
  TRANSACTION_CATEGORIES,
  type TransactionCategory,
} from '@/lib/transaction-category';

export interface DailyTransactionListItem {
  id: string;
  occurredOn: string;
  title: string;
  amount: number;
  category: TransactionCategory;
  paymentMethods: string[];
  staffName: string | null;
}

export interface ReportListResult {
  from: string;
  to: string;
  storeId: StoreSlug | 'all';
  rows: DailyTransactionListItem[];
  totalRows: number;
  totalAmount: number;
  latestRecordDate: string | null;
}

export async function getLatestTransactionDate(
  storeId?: StoreSlug,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('daily_transactions')
    .select('occurred_on')
    .order('occurred_on', { ascending: false })
    .limit(1);

  if (storeId) q = q.eq('store_id', storeId);

  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data?.occurred_on ?? null;
}

export async function listDailyTransactions(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategory,
): Promise<ReportListResult> {
  const supabase = getSupabaseAdmin();

  let q = supabase
    .from('daily_transactions')
    .select(
      'id, occurred_on, title, amount, category, payment_methods, staff_name',
    )
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10000);

  if (storeId) q = q.eq('store_id', storeId);
  if (category) q = q.eq('category', category);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows: DailyTransactionListItem[] = (data ?? []).map((row) => ({
    id: row.id as string,
    occurredOn: row.occurred_on as string,
    title: row.title as string,
    amount: row.amount as number,
    category: (row.category as TransactionCategory) ?? '一般消費',
    paymentMethods: (row.payment_methods as string[]) ?? [],
    staffName: (row.staff_name as string | null) ?? null,
  }));

  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const latestRecordDate = await getLatestTransactionDate(storeId);

  return {
    from,
    to,
    storeId: storeId ?? 'all',
    rows,
    totalRows: rows.length,
    totalAmount,
    latestRecordDate,
  };
}

export function revenueTotalFromRows(rows: DailyTransactionListItem[]): number {
  return rows
    .filter((r) => isRevenueCategory(r.category))
    .reduce((sum, r) => sum + r.amount, 0);
}

export { TRANSACTION_CATEGORIES };

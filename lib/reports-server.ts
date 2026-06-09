import { getSupabaseAdmin } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabase-paginate';
import type { StoreSlug } from '@/lib/stores';

export const LEDGER_API_VERSION = 4;
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
  totalCount: number;
  totalAmount: number;
  latestRecordDate: string | null;
  earliestInRange: string | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
  apiVersion: number;
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

export async function getEarliestTransactionDate(
  storeId?: StoreSlug,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('daily_transactions')
    .select('occurred_on')
    .order('occurred_on', { ascending: true })
    .limit(1);

  if (storeId) q = q.eq('store_id', storeId);

  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data?.occurred_on ?? null;
}

const TX_PAGE_SIZE = 1000;

type TxDbRow = {
  id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  payment_methods: string[];
  staff_name: string | null;
};

function mapTxRow(row: TxDbRow): DailyTransactionListItem {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    title: row.title,
    amount: row.amount,
    category: (row.category as TransactionCategory) ?? '一般消費',
    paymentMethods: row.payment_methods ?? [],
    staffName: row.staff_name ?? null,
  };
}

async function countTransactions(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategory,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('daily_transactions')
    .select('id', { count: 'exact', head: true })
    .gte('occurred_on', from)
    .lte('occurred_on', to);
  if (storeId) q = q.eq('store_id', storeId);
  if (category) q = q.eq('category', category);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function fetchTransactionRows(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategory,
): Promise<DailyTransactionListItem[]> {
  const supabase = getSupabaseAdmin();

  const all = await fetchAllPages<TxDbRow>(async (offset, pageSize) => {
    let q = supabase
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, payment_methods, staff_name')
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (storeId) q = q.eq('store_id', storeId);
    if (category) q = q.eq('category', category);
    return q;
  });

  return all.map(mapTxRow);
}

async function fetchTransactionPage(
  from: string,
  to: string,
  storeId: StoreSlug | undefined,
  category: TransactionCategory | undefined,
  page: number,
  pageSize: number,
): Promise<DailyTransactionListItem[]> {
  const supabase = getSupabaseAdmin();
  const offset = page * pageSize;
  let q = supabase
    .from('daily_transactions')
    .select('id, occurred_on, title, amount, category, payment_methods, staff_name')
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (storeId) q = q.eq('store_id', storeId);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;

  if (error) throw new Error(error.message);
  return (data as TxDbRow[] | null)?.map(mapTxRow) ?? [];
}

export async function listDailyTransactions(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategory,
  options?: { page?: number; pageSize?: number; mode?: 'all' | 'page' },
): Promise<ReportListResult> {
  const pageSize = options?.pageSize ?? TX_PAGE_SIZE;
  const mode = options?.mode ?? 'all';
  const totalCount = await countTransactions(from, to, storeId, category);

  if (mode === 'page') {
    const page = options?.page ?? 0;
    const rows = await fetchTransactionPage(from, to, storeId, category, page, pageSize);
    const start = page * pageSize;
    return buildReportListResult({
      from,
      to,
      storeId,
      rows,
      totalCount,
      page,
      pageSize,
      hasMore: start + rows.length < totalCount,
    });
  }

  const rows = await fetchTransactionRows(from, to, storeId, category);
  return buildReportListResult({
    from,
    to,
    storeId,
    rows,
    totalCount,
    page: 0,
    pageSize: rows.length || pageSize,
    hasMore: false,
  });
}

async function buildReportListResult(input: {
  from: string;
  to: string;
  storeId?: StoreSlug;
  rows: DailyTransactionListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}): Promise<ReportListResult> {
  const { from, to, storeId, rows, totalCount, page, pageSize, hasMore } = input;
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const latestRecordDate = await getLatestTransactionDate(storeId);
  const earliestInRange = rows.length ? rows[rows.length - 1]?.occurredOn ?? null : null;

  return {
    from,
    to,
    storeId: storeId ?? 'all',
    rows,
    totalRows: rows.length,
    totalCount,
    totalAmount,
    latestRecordDate,
    earliestInRange,
    page,
    pageSize,
    hasMore,
    apiVersion: LEDGER_API_VERSION,
  };
}

export function revenueTotalFromRows(rows: DailyTransactionListItem[]): number {
  return rows
    .filter((r) => isRevenueCategory(r.category))
    .reduce((sum, r) => sum + r.amount, 0);
}

export { TRANSACTION_CATEGORIES };

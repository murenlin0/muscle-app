import { resolveClientFromFields } from '@/lib/ledger-client-display';
import { parseNotionNamePhone } from '@/lib/phone';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabase-paginate';
import type { StoreSlug } from '@/lib/stores';

export const LEDGER_API_VERSION = 5;
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
  clientName: string | null;
  clientPhone: string | null;
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
  /** 曾儲值過的客人電話（全店歷史，供 VIP 前綴） */
  vipMemberPhones?: string[];
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
import { LEDGER_UI_PAGE_SIZE } from '@/lib/ledger-pagination';

async function sumTransactionAmounts(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategory,
  clientPhone?: string,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const amounts = await fetchAllPages<{ amount: number }>(async (offset, pageSize) => {
    let q = supabase
      .from('daily_transactions')
      .select('amount')
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .range(offset, offset + pageSize - 1);
    if (storeId) q = q.eq('store_id', storeId);
    if (category) q = q.eq('category', category);
    if (clientPhone) q = applyClientPhoneQuery(q, clientPhone);
    return q;
  });
  return amounts.reduce((sum, r) => sum + (r.amount ?? 0), 0);
}

type TxDbRow = {
  id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  payment_methods: string[];
  staff_name: string | null;
  client_name: string | null;
  client_phone: string | null;
};

function rowMatchesClientPhone(row: TxDbRow, clientPhone: string): boolean {
  if (row.client_phone === clientPhone) return true;
  const parsed = parseNotionNamePhone(row.title);
  return parsed?.phone === clientPhone;
}

function applyClientPhoneQuery<T extends { or: (filters: string) => T }>(
  q: T,
  clientPhone: string,
): T {
  return q.or(`client_phone.eq.${clientPhone},title.ilike.%${clientPhone}%`);
}

function mapTxRow(row: TxDbRow): DailyTransactionListItem {
  const category = (row.category as TransactionCategory) ?? '一般消費';
  let clientName = row.client_name;
  let clientPhone = row.client_phone;
  if (!clientName || !clientPhone) {
    const identity = resolveClientFromFields(
      row.title,
      category,
      row.client_name,
      row.client_phone,
    );
    clientName = identity?.name ?? clientName;
    clientPhone = identity?.phone ?? clientPhone;
  }
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    title: row.title,
    amount: row.amount,
    category,
    paymentMethods: row.payment_methods ?? [],
    staffName: row.staff_name ?? null,
    clientName,
    clientPhone,
  };
}

export async function getVipMemberPhones(storeId: StoreSlug): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const phones = new Set<string>();

  const { data: withPhone } = await supabase
    .from('daily_transactions')
    .select('client_phone')
    .eq('store_id', storeId)
    .eq('category', '會員儲值')
    .not('client_phone', 'is', null);

  for (const row of withPhone ?? []) {
    if (row.client_phone) phones.add(row.client_phone as string);
  }

  const { data: titleOnly } = await supabase
    .from('daily_transactions')
    .select('title')
    .eq('store_id', storeId)
    .eq('category', '會員儲值')
    .is('client_phone', null)
    .limit(2000);

  for (const row of titleOnly ?? []) {
    const parsed = parseNotionNamePhone(row.title as string);
    if (parsed?.phone) phones.add(parsed.phone);
  }

  return [...phones];
}

async function countTransactions(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategory,
  clientPhone?: string,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('daily_transactions')
    .select('id', { count: 'exact', head: true })
    .gte('occurred_on', from)
    .lte('occurred_on', to);
  if (storeId) q = q.eq('store_id', storeId);
  if (category) q = q.eq('category', category);
  if (clientPhone) q = applyClientPhoneQuery(q, clientPhone);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function fetchTransactionRows(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategory,
  clientPhone?: string,
): Promise<DailyTransactionListItem[]> {
  const supabase = getSupabaseAdmin();

  const all = await fetchAllPages<TxDbRow>(async (offset, pageSize) => {
    let q = supabase
      .from('daily_transactions')
      .select(
        'id, occurred_on, title, amount, category, payment_methods, staff_name, client_name, client_phone',
      )
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (storeId) q = q.eq('store_id', storeId);
    if (category) q = q.eq('category', category);
    if (clientPhone) q = applyClientPhoneQuery(q, clientPhone);
    return q;
  });

  return all.filter((row) => !clientPhone || rowMatchesClientPhone(row, clientPhone)).map(mapTxRow);
}

async function fetchTransactionPage(
  from: string,
  to: string,
  storeId: StoreSlug | undefined,
  category: TransactionCategory | undefined,
  page: number,
  pageSize: number,
  clientPhone?: string,
): Promise<DailyTransactionListItem[]> {
  const supabase = getSupabaseAdmin();
  const offset = page * pageSize;
  let q = supabase
    .from('daily_transactions')
    .select(
      'id, occurred_on, title, amount, category, payment_methods, staff_name, client_name, client_phone',
    )
    .gte('occurred_on', from)
    .lte('occurred_on', to);
  if (storeId) q = q.eq('store_id', storeId);
  if (category) q = q.eq('category', category);
  if (clientPhone) q = applyClientPhoneQuery(q, clientPhone);
  q = q
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + pageSize - 1);
  const { data, error } = await q;

  if (error) throw new Error(error.message);
  const rows = (data as TxDbRow[] | null) ?? [];
  return rows
    .filter((row) => !clientPhone || rowMatchesClientPhone(row, clientPhone))
    .map(mapTxRow);
}

export async function listDailyTransactions(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategory,
  options?: {
    page?: number;
    pageSize?: number;
    mode?: 'all' | 'page';
    clientPhone?: string;
    includeVipPhones?: boolean;
  },
): Promise<ReportListResult> {
  const pageSize = options?.pageSize ?? TX_PAGE_SIZE;
  const mode = options?.mode ?? 'all';
  const clientPhone = options?.clientPhone;
  const totalCount = await countTransactions(from, to, storeId, category, clientPhone);
  const totalAmount = await sumTransactionAmounts(from, to, storeId, category, clientPhone);

  const vipMemberPhones =
    options?.includeVipPhones && storeId ? await getVipMemberPhones(storeId) : undefined;

  if (mode === 'page') {
    const page = options?.page ?? 0;
    const rows = await fetchTransactionPage(
      from,
      to,
      storeId,
      category,
      page,
      pageSize,
      clientPhone,
    );
    const start = page * pageSize;
    return buildReportListResult({
      from,
      to,
      storeId,
      rows,
      totalCount,
      totalAmount,
      page,
      pageSize,
      hasMore: start + rows.length < totalCount,
      vipMemberPhones: page === 0 ? vipMemberPhones : undefined,
    });
  }

  const rows = await fetchTransactionRows(from, to, storeId, category, clientPhone);
  return buildReportListResult({
    from,
    to,
    storeId,
    rows,
    totalCount,
    totalAmount,
    page: 0,
    pageSize: rows.length || pageSize,
    hasMore: false,
    vipMemberPhones,
  });
}

async function buildReportListResult(input: {
  from: string;
  to: string;
  storeId?: StoreSlug;
  rows: DailyTransactionListItem[];
  totalCount: number;
  totalAmount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  vipMemberPhones?: string[];
}): Promise<ReportListResult> {
  const { from, to, storeId, rows, totalCount, totalAmount, page, pageSize, hasMore, vipMemberPhones } =
    input;
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
    vipMemberPhones,
  };
}

export function revenueTotalFromRows(rows: DailyTransactionListItem[]): number {
  return rows
    .filter((r) => isRevenueCategory(r.category))
    .reduce((sum, r) => sum + r.amount, 0);
}

export { TRANSACTION_CATEGORIES };

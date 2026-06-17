import { resolveClientFromFields } from '@/lib/ledger-client-display';
import { parseNotionNamePhone } from '@/lib/phone';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabase-paginate';
import type { StoreSlug } from '@/lib/stores';

export const LEDGER_API_VERSION = 6;
import {
  isRevenueCategory,
  TRANSACTION_CATEGORIES,
  type LedgerAccountFilter,
  type TransactionCategory,
} from '@/lib/transaction-category';

export type TransactionCategoryFilter = TransactionCategory | TransactionCategory[];

function normalizeCategories(
  filter?: TransactionCategoryFilter,
): TransactionCategory[] | undefined {
  if (!filter) return undefined;
  return Array.isArray(filter) ? filter : [filter];
}

function applyCategoryFilter<T extends { eq: Function; in: Function }>(
  q: T,
  filter?: TransactionCategoryFilter,
): T {
  const categories = normalizeCategories(filter);
  if (!categories?.length) return q;
  if (categories.length === 1) return q.eq('category', categories[0]) as T;
  return q.in('category', categories) as T;
}

function rowMatchesLedgerAccount(
  row: { category: string; payment_methods: string[] | null },
  account: LedgerAccountFilter,
): boolean {
  const pm = row.payment_methods ?? [];
  if (row.category === '會員使用' || pm.includes('會員使用')) return false;
  return pm.includes(account);
}

function applyLedgerAccountDbFilter<
  T extends { contains: (col: string, val: string[]) => T; neq: (col: string, val: string) => T },
>(q: T, account?: LedgerAccountFilter): T {
  if (!account) return q;
  return q.contains('payment_methods', [account]).neq('category', '會員使用');
}

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
  category?: TransactionCategoryFilter,
  clientPhone?: string,
  ledgerAccount?: LedgerAccountFilter,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const amounts = await fetchAllPages<{
    amount: number;
    category: string;
    payment_methods: string[];
  }>(async (offset, pageSize) => {
    let q = supabase
      .from('daily_transactions')
      .select('amount, category, payment_methods')
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .range(offset, offset + pageSize - 1);
    if (storeId) q = q.eq('store_id', storeId);
    q = applyCategoryFilter(q, category);
    q = applyLedgerAccountDbFilter(q, ledgerAccount);
    if (clientPhone) q = applyClientPhoneQuery(q, clientPhone);
    return q;
  });
  return amounts
    .filter((r) => !ledgerAccount || rowMatchesLedgerAccount(r, ledgerAccount))
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);
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
  category?: TransactionCategoryFilter,
  clientPhone?: string,
  ledgerAccount?: LedgerAccountFilter,
): Promise<number> {
  if (ledgerAccount) {
    const rows = await fetchAllPages<{ category: string; payment_methods: string[] }>(
      async (offset, pageSize) => {
        let q = supabaseCountQuery(from, to, storeId, category, clientPhone, ledgerAccount);
        return q.range(offset, offset + pageSize - 1);
      },
    );
    return rows.filter((r) => rowMatchesLedgerAccount(r, ledgerAccount)).length;
  }

  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('daily_transactions')
    .select('id', { count: 'exact', head: true })
    .gte('occurred_on', from)
    .lte('occurred_on', to);
  if (storeId) q = q.eq('store_id', storeId);
  q = applyCategoryFilter(q, category);
  if (clientPhone) q = applyClientPhoneQuery(q, clientPhone);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function supabaseCountQuery(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategoryFilter,
  clientPhone?: string,
  ledgerAccount?: LedgerAccountFilter,
) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('daily_transactions')
    .select('id, category, payment_methods')
    .gte('occurred_on', from)
    .lte('occurred_on', to);
  if (storeId) q = q.eq('store_id', storeId);
  q = applyCategoryFilter(q, category);
  q = applyLedgerAccountDbFilter(q, ledgerAccount);
  if (clientPhone) q = applyClientPhoneQuery(q, clientPhone);
  return q;
}

async function fetchTransactionRows(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategoryFilter,
  clientPhone?: string,
  ledgerAccount?: LedgerAccountFilter,
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
    q = applyCategoryFilter(q, category);
    q = applyLedgerAccountDbFilter(q, ledgerAccount);
    if (clientPhone) q = applyClientPhoneQuery(q, clientPhone);
    return q;
  });

  return all
    .filter(
      (row) =>
        (!clientPhone || rowMatchesClientPhone(row, clientPhone)) &&
        (!ledgerAccount || rowMatchesLedgerAccount(row, ledgerAccount)),
    )
    .map(mapTxRow);
}

async function fetchTransactionPage(
  from: string,
  to: string,
  storeId: StoreSlug | undefined,
  category: TransactionCategoryFilter | undefined,
  page: number,
  pageSize: number,
  clientPhone?: string,
  ledgerAccount?: LedgerAccountFilter,
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
  q = applyCategoryFilter(q, category);
  q = applyLedgerAccountDbFilter(q, ledgerAccount);
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
    .filter(
      (row) =>
        (!clientPhone || rowMatchesClientPhone(row, clientPhone)) &&
        (!ledgerAccount || rowMatchesLedgerAccount(row, ledgerAccount)),
    )
    .map(mapTxRow);
}

export async function listDailyTransactions(
  from: string,
  to: string,
  storeId?: StoreSlug,
  category?: TransactionCategoryFilter,
  options?: {
    page?: number;
    pageSize?: number;
    mode?: 'all' | 'page';
    clientPhone?: string;
    ledgerAccount?: LedgerAccountFilter;
    includeVipPhones?: boolean;
    /** 翻頁時略過統計查詢（count／sum／VIP／最新日期），只抓當頁列 */
    skipMeta?: boolean;
  },
): Promise<ReportListResult> {
  const pageSize = options?.pageSize ?? TX_PAGE_SIZE;
  const mode = options?.mode ?? 'all';
  const clientPhone = options?.clientPhone;
  const ledgerAccount = options?.ledgerAccount;

  if (mode === 'page' && options?.skipMeta) {
    const page = options?.page ?? 0;
    const rows = await fetchTransactionPage(
      from,
      to,
      storeId,
      category,
      page,
      pageSize,
      clientPhone,
      ledgerAccount,
    );
    return {
      from,
      to,
      storeId: storeId ?? 'all',
      rows,
      totalRows: rows.length,
      totalCount: -1,
      totalAmount: 0,
      latestRecordDate: null,
      earliestInRange: rows.length ? rows[rows.length - 1]?.occurredOn ?? null : null,
      page,
      pageSize,
      hasMore: rows.length === pageSize,
      apiVersion: LEDGER_API_VERSION,
    };
  }

  const page = options?.page ?? 0;
  const [totalCount, totalAmount, vipMemberPhones, latestRecordDate, rows] = await Promise.all([
    countTransactions(from, to, storeId, category, clientPhone, ledgerAccount),
    sumTransactionAmounts(from, to, storeId, category, clientPhone, ledgerAccount),
    options?.includeVipPhones && storeId
      ? getVipMemberPhones(storeId)
      : Promise.resolve(undefined),
    getLatestTransactionDate(storeId),
    mode === 'page'
      ? fetchTransactionPage(
          from,
          to,
          storeId,
          category,
          page,
          pageSize,
          clientPhone,
          ledgerAccount,
        )
      : fetchTransactionRows(from, to, storeId, category, clientPhone, ledgerAccount),
  ]);

  if (mode === 'page') {
    const start = page * pageSize;
    return buildReportListResult({
      from,
      to,
      storeId,
      rows,
      totalCount,
      totalAmount,
      latestRecordDate,
      page,
      pageSize,
      hasMore: start + rows.length < totalCount,
      vipMemberPhones: page === 0 ? vipMemberPhones : undefined,
    });
  }

  return buildReportListResult({
    from,
    to,
    storeId,
    rows,
    totalCount,
    totalAmount,
    latestRecordDate,
    page: 0,
    pageSize: rows.length || pageSize,
    hasMore: false,
    vipMemberPhones,
  });
}

function buildReportListResult(input: {
  from: string;
  to: string;
  storeId?: StoreSlug;
  rows: DailyTransactionListItem[];
  totalCount: number;
  totalAmount: number;
  latestRecordDate: string | null;
  page: number;
  pageSize: number;
  hasMore: boolean;
  vipMemberPhones?: string[];
}): ReportListResult {
  const {
    from,
    to,
    storeId,
    rows,
    totalCount,
    totalAmount,
    latestRecordDate,
    page,
    pageSize,
    hasMore,
    vipMemberPhones,
  } = input;
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

/** 客人 LIFF 消費紀錄：與報表點客人名稱相同篩選邏輯（daily_transactions） */
export async function listClientTransactions(
  storeId: StoreSlug,
  clientPhone: string,
): Promise<DailyTransactionListItem[]> {
  const from = (await getEarliestTransactionDate(storeId)) ?? '1970-01-01';
  const to =
    (await getLatestTransactionDate(storeId)) ?? new Date().toISOString().slice(0, 10);
  return fetchTransactionRows(from, to, storeId, undefined, clientPhone);
}

export { TRANSACTION_CATEGORIES };

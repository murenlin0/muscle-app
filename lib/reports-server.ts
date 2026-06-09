import { getSupabaseAdmin } from '@/lib/supabase';
import type { StoreSlug } from '@/lib/stores';

const REVENUE_SERVICE_TYPES = new Set([
  '30分',
  '60分',
  '90分',
  '120分',
  '150分',
  '180分',
  '儲值',
  '收入',
  'VIP 30分',
  'VIP 60分',
  'VIP 90分',
  'VIP 120分',
  'VIP 150分',
  'VIP 180分',
]);

const REVENUE_PAYMENT_METHODS = new Set(['現金', 'Line', '富邦', '街口', '會員使用', '仁中信']);

export interface ReportSummary {
  from: string;
  to: string;
  storeId: StoreSlug | 'all';
  totalRevenue: number;
  transactionCount: number;
  byPayment: Record<string, number>;
  byStaff: Record<string, number>;
  byDay: { date: string; amount: number; count: number }[];
  latestRecordDate: string | null;
}

function isRevenueRow(serviceType: string | null, paymentMethods: string[]): boolean {
  if (!serviceType || !REVENUE_SERVICE_TYPES.has(serviceType)) return false;
  if (serviceType === '儲值' || serviceType === '收入') return true;
  return paymentMethods.some((p) => REVENUE_PAYMENT_METHODS.has(p));
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

export async function getReportSummary(
  from: string,
  to: string,
  storeId?: StoreSlug,
): Promise<ReportSummary> {
  const supabase = getSupabaseAdmin();

  let q = supabase
    .from('daily_transactions')
    .select(
      'occurred_on, amount, service_type, payment_methods, staff_name, title',
    )
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .order('occurred_on', { ascending: true });

  if (storeId) q = q.eq('store_id', storeId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byPayment: Record<string, number> = {};
  const byStaff: Record<string, number> = {};
  const byDayMap = new Map<string, { amount: number; count: number }>();

  let totalRevenue = 0;
  let transactionCount = 0;

  for (const row of rows) {
    const payments = (row.payment_methods as string[] | null) ?? [];
    if (!isRevenueRow(row.service_type, payments)) continue;

    transactionCount += 1;
    totalRevenue += row.amount ?? 0;

    for (const p of payments) {
      if (REVENUE_PAYMENT_METHODS.has(p)) {
        byPayment[p] = (byPayment[p] ?? 0) + (row.amount ?? 0);
      }
    }

    const staff = row.staff_name ?? '（未指定）';
    byStaff[staff] = (byStaff[staff] ?? 0) + (row.amount ?? 0);

    const day = row.occurred_on as string;
    const bucket = byDayMap.get(day) ?? { amount: 0, count: 0 };
    bucket.amount += row.amount ?? 0;
    bucket.count += 1;
    byDayMap.set(day, bucket);
  }

  const byDay = [...byDayMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const latestRecordDate = await getLatestTransactionDate(storeId);

  return {
    from,
    to,
    storeId: storeId ?? 'all',
    totalRevenue,
    transactionCount,
    byPayment,
    byStaff,
    byDay,
    latestRecordDate,
  };
}

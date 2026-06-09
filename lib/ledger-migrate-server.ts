import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeLedgerAccounts } from '@/lib/ledger-accounts';
import { normalizeCompoundTopupRow } from '@/lib/multi-staff-split';
import {
  LEGACY_TRANSFER_CATEGORY,
  type TransactionCategory,
} from '@/lib/transaction-category';
import type { StoreSlug } from '@/lib/stores';

export interface LedgerMigrateReport {
  scanned: number;
  updated: number;
  deduped: number;
  splitTransfers: number;
  splitMultiStaff: number;
  issues: string[];
}

interface TxMigrateRow {
  id: string;
  store_id: string;
  notion_page_id: string | null;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  payment_methods: string[];
  service_type: string | null;
  staff_name: string | null;
  is_designated: boolean | null;
  member_note: string | null;
  client_name: string | null;
  client_phone: string | null;
  is_vip: boolean | null;
  source: string | null;
}

async function fetchAllTransactions(storeId: StoreSlug): Promise<TxMigrateRow[]> {
  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  const all: TxMigrateRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select(
        'id, store_id, notion_page_id, occurred_on, title, amount, category, payment_methods, service_type, staff_name, is_designated, member_note, client_name, client_phone, is_vip, source',
      )
      .eq('store_id', storeId)
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...(data as TxMigrateRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

/**
 * 僅刪除同一 notion_page_id 或（手動列）完全相同的重複。
 * 不用內容指紋：Notion 常有多筆內容相同但 page 不同的列，皆須保留以對齊餘額。
 */
function rowFingerprint(row: TxMigrateRow): string {
  if (row.notion_page_id) return `notion:${row.notion_page_id}`;
  return `manual:${row.occurred_on}|${row.title.replace(/\s/g, '')}|${row.category}|${row.amount}|${JSON.stringify(row.payment_methods ?? [])}`;
}

async function dedupeTransactions(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  data: TxMigrateRow[],
  report: LedgerMigrateReport,
): Promise<TxMigrateRow[]> {
  const groups = new Map<string, TxMigrateRow[]>();
  for (const row of data) {
    const k = rowFingerprint(row);
    const list = groups.get(k) ?? [];
    list.push(row);
    groups.set(k, list);
  }

  const deleteIds = new Set<string>();

  for (const [, list] of groups) {
    if (list.length <= 1) continue;
    const keeper = list[0];
    for (let i = 1; i < list.length; i++) {
      deleteIds.add(list[i].id);
    }
    void keeper;
  }

  if (deleteIds.size > 0) {
    const ids = [...deleteIds];
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error } = await supabase.from('daily_transactions').delete().in('id', chunk);
      if (error) {
        report.issues.push(`去重刪除失敗: ${error.message}`);
        break;
      }
    }
    report.deduped += deleteIds.size;
    report.updated += deleteIds.size;
  }

  return data.filter((r) => !deleteIds.has(r.id));
}

export async function migrateLedgerData(storeId: StoreSlug = 'store1'): Promise<LedgerMigrateReport> {
  const supabase = getSupabaseAdmin();
  let data = await fetchAllTransactions(storeId);

  const report: LedgerMigrateReport = {
    scanned: data.length,
    updated: 0,
    deduped: 0,
    splitTransfers: 0,
    splitMultiStaff: 0,
    issues: [],
  };

  data = await dedupeTransactions(supabase, data, report);

  for (const row of data) {
    const category = row.category as TransactionCategory | typeof LEGACY_TRANSFER_CATEGORY;

    if (category === LEGACY_TRANSFER_CATEGORY) {
      continue;
    }

    const compound = normalizeCompoundTopupRow(row);
    if (compound) {
      const normalizedAmount = Math.round(compound.amount);
      const normalizedAccounts = normalizeLedgerAccounts(compound.payment_methods, compound.category);
      const { error: upErr } = await supabase
        .from('daily_transactions')
        .update({
          title: compound.title,
          amount: normalizedAmount,
          category: compound.category,
          payment_methods: normalizedAccounts,
          staff_name: compound.staff_name,
          client_name: compound.client_name,
          client_phone: compound.client_phone,
          is_vip: compound.is_vip,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (upErr) {
        report.issues.push(`多人合寫正規化失敗 ${row.id}: ${upErr.message}`);
      } else {
        report.splitMultiStaff += 1;
        report.updated += 1;
      }
      continue;
    }

    const normalizedCategory = category as TransactionCategory;
    const normalizedAccounts = normalizeLedgerAccounts(
      (row.payment_methods as string[]) ?? [],
      normalizedCategory,
    );

    const accountsChanged =
      JSON.stringify(normalizedAccounts) !== JSON.stringify(row.payment_methods ?? []);

    if (accountsChanged) {
      const { error: upErr } = await supabase
        .from('daily_transactions')
        .update({
          payment_methods: normalizedAccounts,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (upErr) {
        report.issues.push(`更新失敗 ${row.id}: ${upErr.message}`);
      } else {
        report.updated += 1;
      }
    }
  }

  return report;
}

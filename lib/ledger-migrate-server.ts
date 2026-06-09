import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeLedgerAccounts } from '@/lib/ledger-accounts';
import { normalizeLedgerAmount } from '@/lib/ledger-amount';
import {
  isMultiStaffCompoundTitle,
  splitMultiStaffTransaction,
} from '@/lib/multi-staff-split';
import { splitLegacyTransferRow, type TransferSourceRow } from '@/lib/transfer-split';
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

/** 僅刪除完全相同的重複列（同日期、標題、類型、金額、帳戶） */
function rowFingerprint(row: TxMigrateRow): string {
  return `${row.occurred_on}|${row.title.replace(/\s/g, '')}|${row.category}|${row.amount}|${JSON.stringify(row.payment_methods ?? [])}`;
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

async function splitCompoundGroup(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  storeId: StoreSlug,
  row: TxMigrateRow,
  all: TxMigrateRow[],
  report: LedgerMigrateReport,
): Promise<void> {
  const split = splitMultiStaffTransaction(row);
  if (!split) {
    report.issues.push(`無法拆分多人合寫：${row.occurred_on} ${row.title.slice(0, 48)}`);
    return;
  }

  const normalizedTitle = row.title.replace(/\s/g, '');
  const relatedIds = all
    .filter(
      (r) => r.occurred_on === row.occurred_on && r.title.replace(/\s/g, '') === normalizedTitle,
    )
    .map((r) => r.id);

  const { error: delErr } = await supabase
    .from('daily_transactions')
    .delete()
    .in('id', relatedIds);

  if (delErr) {
    report.issues.push(`刪除多人合寫舊列失敗: ${delErr.message}`);
    return;
  }

  const { error: insErr } = await supabase.from('daily_transactions').insert(
    split.map((s) => ({
      store_id: storeId,
      occurred_on: row.occurred_on,
      title: s.title,
      amount: normalizeLedgerAmount(s.category, s.amount),
      category: s.category,
      payment_methods: normalizeLedgerAccounts(s.payment_methods, s.category),
      staff_name: s.staff_name,
      client_name: s.client_name,
      client_phone: s.client_phone,
      is_vip: s.is_vip,
      source: row.source ?? 'notion',
      notion_page_id: row.notion_page_id ? `${row.notion_page_id}#${s.staff_name}` : null,
    })),
  );

  if (insErr) {
    report.issues.push(`多人合寫拆分失敗: ${insErr.message}`);
  } else {
    report.splitMultiStaff += 1;
    report.updated += split.length;
  }
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

  const compoundHandled = new Set<string>();

  for (const row of data) {
    if (isMultiStaffCompoundTitle(row.title)) {
      const groupKeyStr = `${row.occurred_on}|${row.title.replace(/\s/g, '')}`;
      if (compoundHandled.has(groupKeyStr)) continue;
      compoundHandled.add(groupKeyStr);
      await splitCompoundGroup(supabase, storeId, row, data, report);
      continue;
    }

    const category = row.category as TransactionCategory | typeof LEGACY_TRANSFER_CATEGORY;

    if (category === LEGACY_TRANSFER_CATEGORY) {
      const methods = (row.payment_methods as string[]) ?? [];
      const amt = row.amount as number;

      if (methods.length === 1) {
        const newCategory: TransactionCategory = amt < 0 ? '轉出' : '轉入';
        const normalizedAmount = normalizeLedgerAmount(newCategory, amt);
        const normalizedAccounts = normalizeLedgerAccounts(methods, newCategory);
        const { error: upErr } = await supabase
          .from('daily_transactions')
          .update({
            category: newCategory,
            amount: normalizedAmount,
            payment_methods: normalizedAccounts,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (upErr) {
          report.issues.push(`轉移改類失敗 ${row.id}: ${upErr.message}`);
        } else {
          report.splitTransfers += 1;
          report.updated += 1;
        }
        continue;
      }

      const split = splitLegacyTransferRow({
        ...row,
        store_id: storeId,
        payment_methods: methods,
      } as TransferSourceRow);

      if (split) {
        await supabase.from('daily_transactions').delete().eq('id', row.id);
        const { error: insErr } = await supabase.from('daily_transactions').insert(
          split.rows.map((s) => ({
            ...s,
            notion_page_id: s.notion_page_id ?? null,
          })),
        );
        if (insErr) {
          report.issues.push(`轉移拆分失敗 ${row.id}: ${insErr.message}`);
        } else {
          report.splitTransfers += 1;
          report.updated += 1;
        }
        continue;
      }

      report.issues.push(
        `無法拆分轉移：${row.occurred_on} ${row.title?.slice(0, 40)} [${methods.join(',')}]`,
      );
    }

    const normalizedCategory = category as TransactionCategory;
    const normalizedAmount = normalizeLedgerAmount(normalizedCategory, row.amount as number);
    const normalizedAccounts = normalizeLedgerAccounts(
      (row.payment_methods as string[]) ?? [],
      normalizedCategory,
    );

    const accountsChanged =
      JSON.stringify(normalizedAccounts) !== JSON.stringify(row.payment_methods ?? []);
    const amountChanged = normalizedAmount !== row.amount;

    if (accountsChanged || amountChanged) {
      const { error: upErr } = await supabase
        .from('daily_transactions')
        .update({
          amount: normalizedAmount,
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

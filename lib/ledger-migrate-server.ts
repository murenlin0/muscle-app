import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeLedgerAccounts } from '@/lib/ledger-accounts';
import { normalizeLedgerAmount } from '@/lib/ledger-amount';
import { splitLegacyTransferRow } from '@/lib/transfer-split';
import {
  LEGACY_TRANSFER_CATEGORY,
  type TransactionCategory,
} from '@/lib/transaction-category';
import type { StoreSlug } from '@/lib/stores';

export interface LedgerMigrateReport {
  scanned: number;
  updated: number;
  splitTransfers: number;
  issues: string[];
}

async function fetchAllTransactions(storeId: StoreSlug) {
  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select(
        'id, store_id, notion_page_id, occurred_on, title, amount, category, payment_methods, service_type, staff_name, is_designated, member_note, client_name, client_phone, is_vip, source',
      )
      .eq('store_id', storeId)
      .order('occurred_on', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

export async function migrateLedgerData(storeId: StoreSlug = 'store1'): Promise<LedgerMigrateReport> {
  const supabase = getSupabaseAdmin();
  const data = await fetchAllTransactions(storeId);

  const report: LedgerMigrateReport = {
    scanned: data.length,
    updated: 0,
    splitTransfers: 0,
    issues: [],
  };

  for (const row of data) {
    const category = row.category as TransactionCategory | typeof LEGACY_TRANSFER_CATEGORY;

    if (category === LEGACY_TRANSFER_CATEGORY) {
      const methods = (row.payment_methods as string[]) ?? [];
      const amt = row.amount as number;

      // 已是單邊列（例：-27600 [街口] / +27600 [仁中信]）
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
      });

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

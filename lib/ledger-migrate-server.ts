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

export async function migrateLedgerData(storeId: StoreSlug = 'store1'): Promise<LedgerMigrateReport> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('daily_transactions')
    .select(
      'id, store_id, notion_page_id, occurred_on, title, amount, category, payment_methods, service_type, staff_name, is_designated, member_note, client_name, client_phone, is_vip, source',
    )
    .eq('store_id', storeId);

  if (error) throw new Error(error.message);

  const report: LedgerMigrateReport = {
    scanned: data?.length ?? 0,
    updated: 0,
    splitTransfers: 0,
    issues: [],
  };

  for (const row of data ?? []) {
    const category = row.category as TransactionCategory | typeof LEGACY_TRANSFER_CATEGORY;

    if (category === LEGACY_TRANSFER_CATEGORY) {
      const split = splitLegacyTransferRow({
        ...row,
        store_id: storeId,
        payment_methods: (row.payment_methods as string[]) ?? [],
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
        `無法拆分轉移：${row.occurred_on} ${row.title?.slice(0, 40)} [${((row.payment_methods as string[]) ?? []).join(',')}]`,
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

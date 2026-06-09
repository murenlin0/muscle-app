import { parseNotionNamePhone } from '@/lib/phone';
import {
  normalizeNotionTitle,
  normalizeStaffName,
} from '@/lib/notion-title-normalize';
import type { NotionDailyRow } from '@/lib/notion-api';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeLedgerAccounts } from '@/lib/ledger-accounts';
import { normalizeLedgerAmount } from '@/lib/ledger-amount';
import type { StoreSlug } from '@/lib/stores';
import { isMultiStaffCompoundTitle, splitMultiStaffTransaction } from '@/lib/multi-staff-split';
import { splitLegacyTransferRow } from '@/lib/transfer-split';
import {
  LEGACY_TRANSFER_CATEGORY,
  mapNotionServiceTypeToCategory,
  type TransactionCategory,
} from '@/lib/transaction-category';

export interface DailyTransactionRow {
  store_id: StoreSlug;
  notion_page_id: string;
  occurred_on: string;
  title: string;
  amount: number;
  service_type: string | null;
  category: TransactionCategory | typeof LEGACY_TRANSFER_CATEGORY;
  payment_methods: string[];
  staff_name: string | null;
  is_designated: boolean;
  member_note: string | null;
  client_name: string | null;
  client_phone: string | null;
  is_vip: boolean;
}

function parseOccurredOn(dateStart: string | null, fallbackIso: string | null): string {
  if (dateStart) {
    const d = dateStart.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  if (fallbackIso) return fallbackIso.slice(0, 10);
  return '1970-01-01';
}

function finalizeRow(row: DailyTransactionRow): DailyTransactionRow {
  const category = row.category as TransactionCategory;
  if (row.category === LEGACY_TRANSFER_CATEGORY) return row;

  return {
    ...row,
    amount: normalizeLedgerAmount(category, row.amount),
    payment_methods: normalizeLedgerAccounts(row.payment_methods, category),
  };
}

export function mapNotionRowToTransaction(
  row: NotionDailyRow,
  storeId: StoreSlug,
): DailyTransactionRow {
  // 保留 Notion 原始標題（師傅、金額、餘額等完整資訊）
  const title = row.title.trim();
  const parsed = parseNotionNamePhone(title);
  const staff = normalizeStaffName(row.staffName);
  const category = mapNotionServiceTypeToCategory(row.serviceType, row.paymentMethods);

  return finalizeRow({
    store_id: storeId,
    notion_page_id: row.pageId,
    occurred_on: parseOccurredOn(row.dateStart, row.lastEdited),
    title,
    amount: row.amount,
    service_type: row.serviceType,
    category,
    payment_methods: row.paymentMethods,
    staff_name: staff,
    is_designated: row.isDesignated,
    member_note: row.memberNote,
    client_name: parsed?.name ?? null,
    client_phone: parsed?.phone ?? null,
    is_vip: Boolean(parsed?.isVip),
  });
}

function expandMultiStaffRow(row: DailyTransactionRow): DailyTransactionRow[] | null {
  if (!isMultiStaffCompoundTitle(row.title)) return null;
  const split = splitMultiStaffTransaction(row);
  if (!split) return null;

  return split.map((s) =>
    finalizeRow({
      ...row,
      title: s.title,
      amount: s.amount,
      category: s.category,
      payment_methods: s.payment_methods,
      staff_name: s.staff_name,
      client_name: s.client_name,
      client_phone: s.client_phone,
      is_vip: s.is_vip,
      notion_page_id: `${row.notion_page_id}#${s.staff_name}`,
    }),
  );
}

function expandRows(rows: DailyTransactionRow[]): DailyTransactionRow[] {
  const out: DailyTransactionRow[] = [];

  for (const row of rows) {
    const multi = expandMultiStaffRow(row);
    if (multi) {
      out.push(...multi);
      continue;
    }

    if (row.category === LEGACY_TRANSFER_CATEGORY) {
      const split = splitLegacyTransferRow(row);
      if (split) {
        for (const s of split.rows) {
          out.push(
            finalizeRow({
              ...row,
              ...s,
              store_id: row.store_id,
              notion_page_id: s.notion_page_id ?? row.notion_page_id,
              category: s.category as TransactionCategory,
            }),
          );
        }
        continue;
      }
    }
    out.push(row);
  }

  return out;
}

export async function upsertDailyTransactions(
  rows: DailyTransactionRow[],
): Promise<{ upserted: number }> {
  const supabase = getSupabaseAdmin();
  const expanded = expandRows(rows);
  const chunkSize = 200;
  let upserted = 0;

  for (let i = 0; i < expanded.length; i += chunkSize) {
    const chunk = expanded.slice(i, i + chunkSize);
    const { error } = await supabase.from('daily_transactions').upsert(chunk, {
      onConflict: 'notion_page_id',
    });
    if (error) throw new Error(`寫入 daily_transactions 失敗：${error.message}`);
    upserted += chunk.length;
  }

  return { upserted };
}

export interface NotionNormalizePreview {
  pageId: string;
  oldTitle: string;
  newTitle: string;
  oldStaff: string | null;
  newStaff: string | null;
}

export function previewNotionNormalizations(rows: NotionDailyRow[]): NotionNormalizePreview[] {
  const out: NotionNormalizePreview[] = [];

  for (const row of rows) {
    const newTitle = normalizeNotionTitle(row.title);
    const newStaff = normalizeStaffName(row.staffName);
    const staffChanged = newStaff && row.staffName && newStaff !== row.staffName;
    if (newTitle !== row.title.trim() || staffChanged) {
      out.push({
        pageId: row.pageId,
        oldTitle: row.title,
        newTitle,
        oldStaff: row.staffName,
        newStaff: staffChanged ? newStaff : row.staffName,
      });
    }
  }

  return out;
}

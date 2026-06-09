import { parseNotionNamePhone } from '@/lib/phone';
import {
  normalizeNotionTitle,
  normalizeStaffName,
} from '@/lib/notion-title-normalize';
import type { NotionDailyRow } from '@/lib/notion-api';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { StoreSlug } from '@/lib/stores';
import {
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
  category: TransactionCategory;
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

export function mapNotionRowToTransaction(
  row: NotionDailyRow,
  storeId: StoreSlug,
): DailyTransactionRow {
  const title = normalizeNotionTitle(row.title);
  const parsed = parseNotionNamePhone(title);
  const staff = normalizeStaffName(row.staffName);

  return {
    store_id: storeId,
    notion_page_id: row.pageId,
    occurred_on: parseOccurredOn(row.dateStart, row.lastEdited),
    title,
    amount: row.amount,
    service_type: row.serviceType,
    category: mapNotionServiceTypeToCategory(row.serviceType, row.paymentMethods),
    payment_methods: row.paymentMethods,
    staff_name: staff,
    is_designated: row.isDesignated,
    member_note: row.memberNote,
    client_name: parsed?.name ?? null,
    client_phone: parsed?.phone ?? null,
    is_vip: Boolean(parsed?.isVip),
  };
}

export async function upsertDailyTransactions(
  rows: DailyTransactionRow[],
): Promise<{ upserted: number }> {
  const supabase = getSupabaseAdmin();
  const chunkSize = 200;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
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

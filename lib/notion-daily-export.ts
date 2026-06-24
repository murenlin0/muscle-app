import {
  buildNotionServiceHoursUpdate,
  getNotionDailyDbId,
  queryNotionDatabaseAll,
  updateNotionPageProperties,
  type NotionDailyRow,
} from '@/lib/notion-api';
import {
  getNotionPropertyName,
  STORE2_PAYMENT_LOCATION_MAP,
} from '@/lib/notion-store-schema';
import { computeServiceHours, serviceHoursEqual } from '@/lib/service-hours';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeStaffName } from '@/lib/notion-title-normalize';
import type { StoreSlug } from '@/lib/stores';
import {
  mapNotionServiceTypeToCategory,
  type TransactionCategory,
} from '@/lib/transaction-category';

export interface DbExportRow {
  id: string;
  notion_page_id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: TransactionCategory;
  service_type: string | null;
  payment_methods: string[];
  staff_name: string | null;
  member_note: string | null;
  is_designated: boolean;
}

export interface SyncToNotionOptions {
  from?: string;
  to?: string;
  dryRun?: boolean;
}

export interface SyncToNotionResult {
  storeId: StoreSlug;
  dryRun: boolean;
  scanned: number;
  linked: number;
  updated: number;
  skippedSame: number;
  skippedNoNotionPage: number;
  skippedConflict: number;
  skippedUnlinked: number;
  errors: string[];
  samples: Array<{ pageId: string; occurredOn: string; fields: string[] }>;
}

function pageIdFromNotionRef(notionPageId: string): string {
  return notionPageId.split('#')[0]!;
}

function mapCanonicalPaymentToStore2Location(methods: string[]): string | null {
  if (!methods.length) return null;
  const sorted = [...methods].sort().join(',');
  for (const [location, canonical] of Object.entries(STORE2_PAYMENT_LOCATION_MAP)) {
    if ([...canonical].sort().join(',') === sorted) return location;
  }
  if (methods.includes('現金')) return '現金';
  if (methods.includes('富邦')) return '郵局';
  if (methods.includes('會員使用')) return 'VIP';
  return methods[0] ?? null;
}

function paymentMethodsEqual(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function exportAmount(amount: number): number {
  return Math.abs(Math.round(amount));
}

function buildTitleProperty(title: string, storeId: StoreSlug) {
  const prop = getNotionPropertyName('名稱電話', storeId);
  return {
    [prop]: { title: [{ type: 'text', text: { content: title } }] },
  };
}

function buildDateProperty(date: string, storeId: StoreSlug) {
  const prop = getNotionPropertyName('Date', storeId);
  return { [prop]: { date: { start: date } } };
}

function buildAmountProperty(amount: number, storeId: StoreSlug) {
  const prop = getNotionPropertyName('金額數字', storeId);
  return { [prop]: { number: exportAmount(amount) } };
}

function buildStaffProperty(staffName: string, storeId: StoreSlug) {
  const prop = getNotionPropertyName('師傅', storeId);
  return { [prop]: { select: { name: staffName } } };
}

function buildServiceTypeProperty(serviceType: string, storeId: StoreSlug) {
  const prop = getNotionPropertyName('消費類型', storeId);
  return { [prop]: { select: { name: serviceType } } };
}

function buildPaymentProperty(methods: string[], storeId: StoreSlug) {
  const prop = getNotionPropertyName('付款方式', storeId);
  if (storeId === 'store2') {
    const location = mapCanonicalPaymentToStore2Location(methods);
    if (!location) return null;
    return { [prop]: { select: { name: location } } };
  }
  return {
    [prop]: { multi_select: methods.map((name) => ({ name })) },
  };
}

function buildMemberNoteProperty(note: string, storeId: StoreSlug) {
  const prop = getNotionPropertyName('會員備註', storeId);
  return {
    [prop]: {
      rich_text: note ? [{ type: 'text', text: { content: note } }] : [],
    },
  };
}

function buildDesignatedProperty(value: boolean, storeId: StoreSlug) {
  const prop = getNotionPropertyName('指定', storeId);
  return { [prop]: { checkbox: value } };
}

function notionPaymentMatchesDb(
  notionRow: NotionDailyRow,
  dbRow: DbExportRow,
): boolean {
  return paymentMethodsEqual(notionRow.paymentMethods, dbRow.payment_methods);
}

export function buildNotionPatchFromDbRow(
  dbRow: DbExportRow,
  notionRow: NotionDailyRow,
  storeId: StoreSlug,
): { patch: Record<string, unknown>; fields: string[] } {
  const patch: Record<string, unknown> = {};
  const fields: string[] = [];

  const dbTitle = dbRow.title.trim();
  if (notionRow.title.trim() !== dbTitle) {
    Object.assign(patch, buildTitleProperty(dbTitle, storeId));
    fields.push('標題');
  }

  const dbDate = dbRow.occurred_on.slice(0, 10);
  const notionDate = notionRow.dateStart?.slice(0, 10) ?? null;
  if (notionDate !== dbDate) {
    Object.assign(patch, buildDateProperty(dbDate, storeId));
    fields.push('日期');
  }

  if (exportAmount(dbRow.amount) !== exportAmount(notionRow.amount)) {
    Object.assign(patch, buildAmountProperty(dbRow.amount, storeId));
    fields.push('金額');
  }

  const dbStaff = normalizeStaffName(dbRow.staff_name);
  const notionStaff = normalizeStaffName(notionRow.staffName);
  if (dbStaff && dbStaff !== notionStaff) {
    Object.assign(patch, buildStaffProperty(dbStaff, storeId));
    fields.push('師傅');
  }

  if (!notionPaymentMatchesDb(notionRow, dbRow)) {
    const paymentPatch = buildPaymentProperty(dbRow.payment_methods, storeId);
    if (paymentPatch) {
      Object.assign(patch, paymentPatch);
      fields.push('帳戶');
    }
  }

  if (
    dbRow.service_type &&
    dbRow.service_type !== notionRow.serviceType &&
    mapNotionServiceTypeToCategory(dbRow.service_type, dbRow.payment_methods) === dbRow.category
  ) {
    Object.assign(patch, buildServiceTypeProperty(dbRow.service_type, storeId));
    fields.push('類型');
  }

  const dbNote = (dbRow.member_note ?? '').trim();
  const notionNote = (notionRow.memberNote ?? '').trim();
  if (dbNote !== notionNote) {
    Object.assign(patch, buildMemberNoteProperty(dbNote, storeId));
    fields.push('備註');
  }

  if (Boolean(dbRow.is_designated) !== Boolean(notionRow.isDesignated)) {
    Object.assign(patch, buildDesignatedProperty(dbRow.is_designated, storeId));
    fields.push('指定');
  }

  const computedHours = computeServiceHours(dbTitle, dbRow.category);
  if (!serviceHoursEqual(computedHours, notionRow.serviceHours)) {
    Object.assign(patch, buildNotionServiceHoursUpdate(computedHours, storeId));
    fields.push('時數');
  }

  return { patch, fields };
}

async function loadDbRowsForExport(
  storeId: StoreSlug,
  from?: string,
  to?: string,
): Promise<DbExportRow[]> {
  const supabase = getSupabaseAdmin();
  const all: DbExportRow[] = [];
  let offset = 0;

  for (;;) {
    let q = supabase
      .from('daily_transactions')
      .select(
        'id, notion_page_id, occurred_on, title, amount, category, service_type, payment_methods, staff_name, member_note, is_designated',
      )
      .eq('store_id', storeId)
      .not('notion_page_id', 'is', null)
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (from) q = q.gte('occurred_on', from);
    if (to) q = q.lte('occurred_on', to);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      if (!row.notion_page_id) continue;
      all.push({
        id: row.id as string,
        notion_page_id: row.notion_page_id as string,
        occurred_on: row.occurred_on as string,
        title: row.title as string,
        amount: row.amount as number,
        category: row.category as TransactionCategory,
        service_type: (row.service_type as string | null) ?? null,
        payment_methods: (row.payment_methods as string[]) ?? [],
        staff_name: (row.staff_name as string | null) ?? null,
        member_note: (row.member_note as string | null) ?? null,
        is_designated: Boolean(row.is_designated),
      });
    }

    if (data.length < 1000) break;
    offset += 1000;
  }

  return all;
}

function groupDbRowsByPage(rows: DbExportRow[]): Map<string, DbExportRow[]> {
  const map = new Map<string, DbExportRow[]>();
  for (const row of rows) {
    const pageId = pageIdFromNotionRef(row.notion_page_id);
    const arr = map.get(pageId);
    if (arr) arr.push(row);
    else map.set(pageId, [row]);
  }
  return map;
}

function pickPrimaryRow(rows: DbExportRow[]): { row: DbExportRow; conflict: boolean } {
  const withoutSuffix = rows.filter((r) => !r.notion_page_id.includes('#'));
  const pool = withoutSuffix.length ? withoutSuffix : rows;
  const titles = new Set(pool.map((r) => r.title.trim()));
  const conflict = titles.size > 1;
  const row = pool[0]!;
  return { row, conflict };
}

export async function syncDailyTransactionsToNotion(
  storeId: StoreSlug,
  options: SyncToNotionOptions = {},
): Promise<SyncToNotionResult> {
  const dryRun = Boolean(options.dryRun);
  const dbRows = await loadDbRowsForExport(storeId, options.from, options.to);
  const notionRows = await queryNotionDatabaseAll(getNotionDailyDbId(storeId));
  const notionByPage = new Map(notionRows.map((r) => [r.pageId, r]));

  const grouped = groupDbRowsByPage(dbRows);
  const result: SyncToNotionResult = {
    storeId,
    dryRun,
    scanned: dbRows.length,
    linked: grouped.size,
    updated: 0,
    skippedSame: 0,
    skippedNoNotionPage: 0,
    skippedConflict: 0,
    skippedUnlinked: 0,
    errors: [],
    samples: [],
  };

  for (const [pageId, rows] of grouped) {
    const notionRow = notionByPage.get(pageId);
    if (!notionRow) {
      result.skippedNoNotionPage += 1;
      continue;
    }

    const { row, conflict } = pickPrimaryRow(rows);
    if (conflict) {
      result.skippedConflict += 1;
      continue;
    }

    const { patch, fields } = buildNotionPatchFromDbRow(row, notionRow, storeId);
    if (!fields.length) {
      result.skippedSame += 1;
      continue;
    }

    if (result.samples.length < 8) {
      result.samples.push({
        pageId,
        occurredOn: row.occurred_on,
        fields,
      });
    }

    if (dryRun) {
      result.updated += 1;
      continue;
    }

    try {
      await updateNotionPageProperties(pageId, patch);
      result.updated += 1;
    } catch (e) {
      result.errors.push(
        `[${row.occurred_on}] ${pageId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}

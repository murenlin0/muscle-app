import {
  getGoogleCalendarId,
  getGoogleRefreshToken,
} from '@/lib/integration-settings';
import {
  calendarEventIsStaffRenameOnly,
  calendarEventMatchesReportRows,
  inferCheckoutPaymentFromTitle,
  isCalendarCheckoutEvent,
  type ReportRowForMatch,
} from '@/lib/calendar-report-match';
import { updateReportStaffFromCalendarEvent } from '@/lib/calendar-checkout-sync';
import { syncClientBalanceInDb } from '@/lib/client-balance-server';
import { refreshGoogleAccessToken } from '@/lib/google-oauth';
import { parseStaffPrefixFromCalendarTitle, resolveStoreSlugFromStaffName } from '@/lib/booking-message';
import { parseCompoundVipTitle } from '@/lib/ledger-title-fix';
import {
  applyTitleBalanceIfMissing,
  patchGoogleCalendarTitleIfNeeded,
} from '@/lib/calendar-title-patch';
import {
  clientMemberBalance,
  memberRowSignedAmount,
  parseBalanceAfter顿号,
  type MemberBalanceRow,
} from '@/lib/ledger-title-balance';
import { canonicalStaffName } from '@/lib/multi-staff-split';
import { normalizeStaffName } from '@/lib/notion-title-normalize';
import { parseNotionNamePhone, stripAllSpaces } from '@/lib/phone';
import { getSupabaseAdmin } from '@/lib/supabase';
import { listActiveStaffForRoster } from '@/lib/staff-auth-server';
import { formatStoreDateIso } from '@/lib/store-timezone';
import type { StoreSlug } from '@/lib/stores';
import type { TransactionCategory } from '@/lib/transaction-category';

const COLOR_TO_PAYMENT: Record<
  string,
  { methods: string[]; defaultCategory: TransactionCategory }
> = {
  '5': { methods: ['現金'], defaultCategory: '一般消費' },
  '7': { methods: ['富邦'], defaultCategory: '一般消費' },
  '9': { methods: ['富邦'], defaultCategory: '一般消費' },
  '3': { methods: [], defaultCategory: '會員使用' },
};

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  colorId?: string;
  start: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  updated: string;
  status?: string;
}

export interface CalendarBackfillOptions {
  fromDate: string;
  toDate?: string;
  storeId?: StoreSlug;
  dryRun?: boolean;
  /** 略過 appointments 限制，匯入所有已結帳色事件 */
  ignoreAppointmentGate?: boolean;
  /** 報表已有同標題/同電話列時略過（避免 notion_import 重複） */
  skipIfReportRowExists?: boolean;
}

export interface BalanceMismatchRow {
  eventId: string;
  occurredOn: string;
  title: string;
  category: string;
  amount: number;
  titleBalance: number | null;
  computedBalance: number | null;
  clientPhone: string | null;
}

export interface CalendarBackfillResult {
  scanned: number;
  checkoutColored: number;
  imported: number;
  skippedExisting: number;
  skippedReportMatch: number;
  skippedPending: number;
  errors: string[];
  titles: string[];
  balanceMismatches: BalanceMismatchRow[];
}

type TxInsert = {
  store_id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: TransactionCategory;
  payment_methods: string[];
  staff_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  is_vip: boolean;
  source: string;
  member_note: string;
};

function gcalNote(eventId: string, part?: 'topup' | 'usage' | 'single'): string {
  return part ? `gcal:${eventId}:${part}` : `gcal:${eventId}`;
}

function parseSimpleTopupUsage(title: string): { topup: number; usage: number } | null {
  const t = title.replace(/\s/g, '');
  const m = t.match(/\+(\d+)-(\d+)/);
  if (!m) return null;
  const topup = Number(m[1]);
  const usage = Number(m[2]);
  if (!topup || !usage) return null;
  return { topup, usage };
}

function parseSingleCheckoutAmount(title: string, category: TransactionCategory): number {
  const t = title.replace(/\s/g, '');
  if (/\+\d+-\d+/.test(t)) return 0;
  if (category === '會員使用') {
    const usage = t.match(/\d+分-(\d+)/);
    if (usage) return Number(usage[1]);
  }
  const cash = t.match(/\d+分(\d+)(?!\+|-)/);
  if (cash) return Number(cash[1]);
  return 0;
}

function buildCalendarSplitTitles(
  title: string,
  topup: number,
  usage: number,
  clientName: string | null,
  clientPhone: string | null,
  balanceAfterTopup: number,
  balanceAfterUsage: number,
): { topupTitle: string; usageTitle: string } {
  const t = title.replace(/\s/g, '');
  const head = t.match(/^(.+?\d+分)/)?.[1] ?? '';
  const suffix =
    clientName && clientPhone
      ? `VIP${clientName}${clientPhone}`
      : `${clientName ?? ''}${clientPhone ?? ''}`;
  const vip = suffix.startsWith('VIP') ? suffix : `VIP${suffix}`;
  return {
    topupTitle: head
      ? `${head}+${topup}、${balanceAfterTopup}${vip}`
      : `+${topup}、${balanceAfterTopup}${vip}`,
    usageTitle: `${head}-${usage}、${balanceAfterUsage}${vip}`,
  };
}

function resolveStaffDisplayNameFromTitle(title: string): string | null {
  const prefix = parseStaffPrefixFromCalendarTitle(title);
  if (!prefix) return null;
  const normalized = normalizeStaffName(prefix) ?? prefix;
  return canonicalStaffName(normalized);
}

function resolveClientFromTitle(title: string): {
  name: string | null;
  phone: string | null;
  isVip: boolean;
} {
  const parsed = parseNotionNamePhone(title);
  if (!parsed) {
    const phoneMatch = title.match(/09\d{8}/);
    return {
      name: null,
      phone: phoneMatch?.[0] ?? null,
      isVip: /VIP/i.test(title),
    };
  }
  return { name: parsed.name, phone: parsed.phone, isVip: parsed.isVip ?? false };
}

function eventStartIso(ev: GoogleCalendarEvent): string {
  return ev.start.dateTime ?? `${ev.start.date}T12:00:00+08:00`;
}

async function fetchCalendarEventsInRange(
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEvent[]> {
  const calendarId = await getGoogleCalendarId();
  if (!calendarId) throw new Error('缺少 GOOGLE_CALENDAR_ID');

  const refreshToken = await getGoogleRefreshToken();
  if (!refreshToken) throw new Error('尚未完成 Google OAuth 授權');

  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const all: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      fields: 'nextPageToken,items(id,summary,colorId,start,end,updated,status)',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!calRes.ok) {
      const err = (await calRes.json()) as { error?: { message?: string } };
      throw new Error(err.error?.message ?? 'Google Calendar API 回傳錯誤');
    }

    const calData = (await calRes.json()) as {
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
    };
    all.push(...(calData.items ?? []));
    pageToken = calData.nextPageToken;
  } while (pageToken);

  return all;
}

/** 全店共用日曆：gcal 事件 ID 任一店已有即略過，避免重複匯入 */
async function loadExistingGcalEventIds(): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const notes = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select('member_note')
      .like('member_note', 'gcal:%')
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const note = row.member_note as string;
      if (note) notes.add(note.split(':').slice(0, 2).join(':'));
    }
    if (!data?.length || data.length < 1000) break;
    offset += 1000;
  }
  return notes;
}

async function loadAppointmentStoreByEventId(
  timeMin: string,
  timeMax: string,
): Promise<Map<string, StoreSlug>> {
  const supabase = getSupabaseAdmin();
  const map = new Map<string, StoreSlug>();
  const { data, error } = await supabase
    .from('appointments')
    .select('calendar_event_id, store_id')
    .not('calendar_event_id', 'is', null)
    .gte('starts_at', timeMin)
    .lte('starts_at', timeMax);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const eventId = row.calendar_event_id as string;
    if (eventId) map.set(eventId, row.store_id as StoreSlug);
  }
  return map;
}

async function loadReportRowsByDate(
  storeId: StoreSlug,
  fromDate: string,
  toDate: string,
): Promise<Map<string, ReportRowForMatch[]>> {
  const supabase = getSupabaseAdmin();
  const map = new Map<string, ReportRowForMatch[]>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select('occurred_on, title, amount, member_note')
      .eq('store_id', storeId)
      .gte('occurred_on', fromDate)
      .lte('occurred_on', toDate)
      .order('occurred_on', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      const date = row.occurred_on as string;
      const arr = map.get(date) ?? [];
      arr.push({
        title: row.title as string,
        amount: row.amount as number,
        member_note: (row.member_note as string | null) ?? null,
      });
      map.set(date, arr);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return map;
}

function resolveStoreForCalendarEvent(
  title: string,
  eventId: string,
  appointmentStoreByEventId: Map<string, StoreSlug>,
  roster: Awaited<ReturnType<typeof listActiveStaffForRoster>>,
  fallbackStore: StoreSlug,
): StoreSlug {
  const fromAppt = appointmentStoreByEventId.get(eventId);
  if (fromAppt) return fromAppt;

  const staffName = resolveStaffDisplayNameFromTitle(title);
  const fromStaff = resolveStoreSlugFromStaffName(staffName, roster);
  if (fromStaff) return fromStaff;

  const prefix = parseStaffPrefixFromCalendarTitle(title);
  if (prefix) {
    const fromPrefix = resolveStoreSlugFromStaffName(prefix, roster);
    if (fromPrefix) return fromPrefix;
    const normalized = normalizeStaffName(prefix) ?? prefix;
    const fromCanonical = resolveStoreSlugFromStaffName(canonicalStaffName(normalized), roster);
    if (fromCanonical) return fromCanonical;
  }

  return fallbackStore;
}

async function loadMemberRowsForBalance(storeId: StoreSlug): Promise<MemberBalanceRow[]> {
  const supabase = getSupabaseAdmin();
  const all: MemberBalanceRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_name, client_phone')
      .eq('store_id', storeId)
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    all.push(...(data as MemberBalanceRow[]));
    if (!data?.length || data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

type MemberRowWithMeta = MemberBalanceRow & { id: string; source?: string };

function phoneKey(row: {
  client_phone?: string | null;
  title: string;
}): string | null {
  if (row.client_phone) return row.client_phone;
  return parseNotionNamePhone(row.title)?.phone ?? null;
}

/** 納入全部歷史 + 同批 pending，依序累計後該筆交易完成應有餘額 */
function expectedBalanceAfterRow(
  history: MemberBalanceRow[],
  pendingBefore: TxInsert[],
  row: TxInsert,
): number | null {
  const phone = phoneKey(row);
  if (!phone) return null;

  let running = 0;
  let matched = false;

  for (const r of history) {
    if (phoneKey(r) !== phone) continue;
    running += memberRowSignedAmount(r.category, r.amount);
    matched = true;
  }

  for (const p of pendingBefore) {
    if (phoneKey(p) !== phone) continue;
    running += memberRowSignedAmount(p.category, p.amount);
    matched = true;
  }

  running += memberRowSignedAmount(row.category, row.amount);

  return matched || running !== 0 ? running : running;
}

function auditRowBalance(
  row: TxInsert,
  memberRows: MemberBalanceRow[],
  pendingRows: TxInsert[],
): BalanceMismatchRow | null {
  if (!['會員儲值', '會員使用', '會員補差額'].includes(row.category)) return null;

  const titleBalance = parseBalanceAfter顿号(stripAllSpaces(row.title));
  if (titleBalance === null) return null;

  const pendingBefore = pendingRows.filter(
    (p) =>
      p.occurred_on < row.occurred_on ||
      (p.occurred_on === row.occurred_on && pendingRows.indexOf(p) < pendingRows.indexOf(row)),
  );

  const computed = expectedBalanceAfterRow(memberRows, pendingBefore, row);
  if (computed === null || computed === titleBalance) return null;

  return {
    eventId: row.member_note.replace(/^gcal:([^:]+).*$/, '$1'),
    occurredOn: row.occurred_on,
    title: row.title,
    category: row.category,
    amount: row.amount,
    titleBalance,
    computedBalance: computed,
    clientPhone: phoneKey(row),
  };
}

const CATEGORY_ORDER: Record<string, number> = {
  會員儲值: 0,
  會員補差額: 1,
  會員使用: 2,
};

function memberRowSort(a: MemberRowWithMeta, b: MemberRowWithMeta): number {
  if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? -1 : 1;
  const ca = CATEGORY_ORDER[a.category] ?? 9;
  const cb = CATEGORY_ORDER[b.category] ?? 9;
  if (ca !== cb) return ca - cb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

async function loadAllMemberRowsWithMeta(storeId: StoreSlug): Promise<MemberRowWithMeta[]> {
  const supabase = getSupabaseAdmin();
  const all: MemberRowWithMeta[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_name, client_phone, source')
      .eq('store_id', storeId)
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    all.push(...(data as MemberRowWithMeta[]));
    if (!data?.length || data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

/**
 * 對帳：納入 6/11 前全部會員流水，檢查 backfill 列的頓號餘額是否與累計一致。
 */
export async function auditCalendarBackfillBalances(
  storeId: StoreSlug = 'store1',
  fromDate = '2026-06-11',
): Promise<BalanceMismatchRow[]> {
  const all = await loadAllMemberRowsWithMeta(storeId);
  all.sort(memberRowSort);
  const mismatches: BalanceMismatchRow[] = [];
  const runningByPhone = new Map<string, number>();

  for (const row of all) {
    const phone = phoneKey(row);
    if (!phone) continue;

    const prior = runningByPhone.get(phone) ?? 0;
    const delta = memberRowSignedAmount(row.category, row.amount);
    const after = prior + delta;
    runningByPhone.set(phone, after);

    const isBackfill =
      row.source === 'calendar_backfill' && row.occurred_on >= fromDate;
    if (!isBackfill) continue;

    const titleBalance = parseBalanceAfter顿号(stripAllSpaces(row.title));
    if (titleBalance === null) continue;
    if (titleBalance === after) continue;

    mismatches.push({
      eventId: '',
      occurredOn: row.occurred_on,
      title: row.title,
      category: row.category,
      amount: row.amount,
      titleBalance,
      computedBalance: after,
      clientPhone: phone,
    });
  }

  return mismatches;
}

function buildRowsFromEvent(
  ev: GoogleCalendarEvent,
  storeId: StoreSlug,
  memberRows: MemberBalanceRow[],
  pendingInserts: TxInsert[],
): TxInsert[] {
  const title = ev.summary?.trim() ?? '';
  if (!title) return [];

  const payment =
    COLOR_TO_PAYMENT[ev.colorId ?? ''] ?? inferCheckoutPaymentFromTitle(title);
  if (!payment) return [];

  const staffName = resolveStaffDisplayNameFromTitle(title);
  const client = resolveClientFromTitle(title);
  const occurredOn = formatStoreDateIso(new Date(eventStartIso(ev)));

  const compound = parseCompoundVipTitle(title) ?? parseSimpleTopupUsage(title);
  const rows: TxInsert[] = [];

  if (compound && 'topup' in compound && 'usage' in compound) {
    const topup = compound.topup;
    const usage = compound.usage;

    let prior = 0;
    if (client.phone) {
      prior =
        (clientMemberBalance(memberRows, client.phone) ?? 0) +
        pendingInserts
          .filter((p) => p.client_phone === client.phone)
          .reduce((s, p) => s + memberRowSignedAmount(p.category, p.amount), 0);
    }

    const afterTopup = prior + topup;
    const afterUsage = prior + topup - usage;
    const parsedCompound = parseCompoundVipTitle(title);
    const finalFromTitle =
      parsedCompound && parsedCompound.finalBalance > 0
        ? parsedCompound.finalBalance
        : afterUsage;

    const { topupTitle, usageTitle } = buildCalendarSplitTitles(
      title,
      topup,
      usage,
      client.name,
      client.phone,
      afterTopup,
      finalFromTitle,
    );

    const topupMethods = payment.methods.length ? payment.methods : ['現金'];
    rows.push({
      store_id: storeId,
      occurred_on: occurredOn,
      title: applyTitleBalanceIfMissing(
        topupTitle,
        '會員儲值',
        topup,
        afterTopup,
        client.name,
        client.phone,
      ),
      amount: topup,
      category: '會員儲值',
      payment_methods: topupMethods,
      staff_name: staffName,
      client_name: client.name,
      client_phone: client.phone,
      is_vip: client.isVip || true,
      source: 'calendar_backfill',
      member_note: gcalNote(ev.id, 'topup'),
    });

    rows.push({
      store_id: storeId,
      occurred_on: occurredOn,
      title: applyTitleBalanceIfMissing(
        usageTitle,
        '會員使用',
        usage,
        finalFromTitle,
        client.name,
        client.phone,
      ),
      amount: usage,
      category: '會員使用',
      payment_methods: [],
      staff_name: staffName,
      client_name: client.name,
      client_phone: client.phone,
      is_vip: client.isVip || true,
      source: 'calendar_backfill',
      member_note: gcalNote(ev.id, 'usage'),
    });
  } else {
    const amount = parseSingleCheckoutAmount(title, payment.defaultCategory);
    let finalTitle = title;
    if (client.phone && payment.defaultCategory === '會員使用') {
      const prior =
        (clientMemberBalance(memberRows, client.phone) ?? 0) +
        pendingInserts
          .filter((p) => p.client_phone === client.phone)
          .reduce((s, p) => s + memberRowSignedAmount(p.category, p.amount), 0);
      const balanceAfter = prior - amount;
      finalTitle = applyTitleBalanceIfMissing(
        title,
        '會員使用',
        amount,
        balanceAfter,
        client.name,
        client.phone,
      );
    }

    rows.push({
      store_id: storeId,
      occurred_on: occurredOn,
      title: finalTitle,
      amount: amount || Math.abs(amount),
      category: payment.defaultCategory,
      payment_methods: payment.methods,
      staff_name: staffName,
      client_name: client.name,
      client_phone: client.phone,
      is_vip: client.isVip,
      source: 'calendar_backfill',
      member_note: gcalNote(ev.id, 'single'),
    });
  }

  return rows;
}

/**
 * 自指定日期起，匯入 Google 日曆已結帳色事件 → daily_transactions。
 * 暫不限制「師傅 UI 建立的 appointment」。
 */
export async function syncCalendarBackfill(
  options: CalendarBackfillOptions,
): Promise<CalendarBackfillResult> {
  const storeId = options.storeId ?? 'store1';
  const toDate = options.toDate ?? formatStoreDateIso(new Date());
  const timeMin = `${options.fromDate}T00:00:00+08:00`;
  const timeMax = `${toDate}T23:59:59+08:00`;

  const result: CalendarBackfillResult = {
    scanned: 0,
    checkoutColored: 0,
    imported: 0,
    skippedExisting: 0,
    skippedReportMatch: 0,
    skippedPending: 0,
    errors: [],
    titles: [],
    balanceMismatches: [],
  };

  const events = await fetchCalendarEventsInRange(timeMin, timeMax);
  result.scanned = events.length;

  const reportRowsByDate = options.skipIfReportRowExists
    ? await loadReportRowsByDate(storeId, options.fromDate, toDate)
    : null;

  const checkoutEvents = events
    .filter((ev) => {
      if (ev.status === 'cancelled') return false;
      return isCalendarCheckoutEvent(
        ev.colorId,
        ev.summary?.trim() ?? '',
        COLOR_TO_PAYMENT,
      );
    })
    .sort(
      (a, b) =>
        new Date(eventStartIso(a)).getTime() - new Date(eventStartIso(b)).getTime(),
    );

  result.checkoutColored = checkoutEvents.length;

  const existingNotes = await loadExistingGcalEventIds();
  const appointmentStoreByEventId = await loadAppointmentStoreByEventId(timeMin, timeMax);
  const roster = await listActiveStaffForRoster();
  const memberRowsByStore = new Map<StoreSlug, MemberBalanceRow[]>();
  const pendingByStore = new Map<StoreSlug, TxInsert[]>();
  const supabase = getSupabaseAdmin();
  const clientsToSync = new Set<string>();

  async function memberRowsFor(store: StoreSlug): Promise<MemberBalanceRow[]> {
    if (!memberRowsByStore.has(store)) {
      memberRowsByStore.set(store, await loadMemberRowsForBalance(store));
    }
    return memberRowsByStore.get(store)!;
  }

  for (const ev of checkoutEvents) {
    const noteKey = `gcal:${ev.id}`;
    const title = ev.summary?.trim() ?? '';
    const occurredOn = formatStoreDateIso(new Date(eventStartIso(ev)));
    const resolvedStore = resolveStoreForCalendarEvent(
      title,
      ev.id,
      appointmentStoreByEventId,
      roster,
      storeId,
    );

    async function syncStaffFromTitle(): Promise<void> {
      if (options.dryRun || !title) return;
      if (options.storeId && resolvedStore !== options.storeId) return;
      try {
        await updateReportStaffFromCalendarEvent(supabase, {
          storeId: resolvedStore,
          eventId: ev.id,
          title,
          occurredOn,
        });
      } catch (e) {
        result.errors.push(
          `[${title}] 更新師傅失敗：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    if (existingNotes.has(noteKey)) {
      await syncStaffFromTitle();
      result.skippedExisting++;
      continue;
    }

    if (options.storeId && resolvedStore !== options.storeId) {
      continue;
    }

    if (reportRowsByDate) {
      const dayRows = reportRowsByDate.get(occurredOn) ?? [];
      if (calendarEventMatchesReportRows(ev.id, title, dayRows)) {
        await syncStaffFromTitle();
        result.skippedReportMatch += 1;
        continue;
      }
      if (calendarEventIsStaffRenameOnly(title, dayRows)) {
        await syncStaffFromTitle();
        result.skippedReportMatch += 1;
        continue;
      }
    }

    try {
      const memberRows = await memberRowsFor(resolvedStore);
      const pendingInserts = pendingByStore.get(resolvedStore) ?? [];
      const rows = buildRowsFromEvent(ev, resolvedStore, memberRows, pendingInserts);
      if (!rows.length) {
        result.skippedPending++;
        continue;
      }

      for (const row of rows) {
        const mismatch = auditRowBalance(row, memberRows, pendingInserts);
        if (mismatch) result.balanceMismatches.push(mismatch);
        pendingInserts.push(row);
      }
      pendingByStore.set(resolvedStore, pendingInserts);

      if (reportRowsByDate) {
        for (const row of rows) {
          const arr = reportRowsByDate.get(row.occurred_on) ?? [];
          arr.push({
            title: row.title,
            amount: row.amount,
            member_note: row.member_note,
          });
          reportRowsByDate.set(row.occurred_on, arr);
        }
      }

      if (options.dryRun) {
        result.imported += rows.length;
        result.titles.push(ev.summary ?? ev.id);
        continue;
      }

      const { error } = await supabase.from('daily_transactions').insert(rows);
      if (error) {
        result.errors.push(`[${ev.summary}] 寫入失敗：${error.message}`);
        for (let i = 0; i < rows.length; i++) pendingInserts.pop();
        pendingByStore.set(resolvedStore, pendingInserts);
        continue;
      }

      for (const row of rows) {
        memberRows.push({
          occurred_on: row.occurred_on,
          title: row.title,
          amount: row.amount,
          category: row.category,
          client_name: row.client_name,
          client_phone: row.client_phone,
        });
      }
      memberRowsByStore.set(resolvedStore, memberRows);
      existingNotes.add(noteKey);
      result.imported += rows.length;
      result.titles.push(ev.summary ?? ev.id);

      const compound = parseCompoundVipTitle(title) ?? parseSimpleTopupUsage(title);
      const usageRow = rows.find((r) => r.category === '會員使用');
      const clientName = rows[0]?.client_name ?? null;
      const clientPhone = rows[0]?.client_phone ?? null;
      if (compound && usageRow) {
        const balanceAfterUsage = parseBalanceAfter顿号(stripAllSpaces(usageRow.title));
        if (balanceAfterUsage !== null) {
          await patchGoogleCalendarTitleIfNeeded(ev.id, title, {
            topup: compound.topup,
            usage: compound.usage,
            balanceAfterUsage,
            clientName,
            clientPhone,
          });
        }
      } else if (rows.length === 1 && rows[0]?.category === '會員使用') {
        const balanceAfterUsage = parseBalanceAfter顿号(stripAllSpaces(rows[0].title));
        if (balanceAfterUsage !== null) {
          await patchGoogleCalendarTitleIfNeeded(ev.id, title, {
            usage: rows[0].amount,
            balanceAfterUsage,
            clientName,
            clientPhone,
          });
        }
      }

      for (const row of rows) {
        if (row.client_phone) clientsToSync.add(`${resolvedStore}:${row.client_phone}`);
      }
    } catch (e) {
      result.errors.push(
        `[${ev.summary ?? ev.id}] ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (!options.dryRun) {
    for (const key of clientsToSync) {
      const sep = key.indexOf(':');
      const store = key.slice(0, sep) as StoreSlug;
      const phone = key.slice(sep + 1);
      try {
        await syncClientBalanceInDb(store, phone);
      } catch (e) {
        result.errors.push(
          `[餘額同步 ${phone}] ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  return result;
}

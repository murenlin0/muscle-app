import {
  getGoogleCalendarId,
  getGoogleRefreshToken,
} from '@/lib/integration-settings';
import { refreshGoogleAccessToken } from '@/lib/google-oauth';
import { parseStaffPrefixFromCalendarTitle } from '@/lib/booking-message';
import { parseCompoundVipTitle } from '@/lib/ledger-title-fix';
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
  balanceAfter: number,
): { topupTitle: string; usageTitle: string } {
  const t = title.replace(/\s/g, '');
  const head = t.match(/^(.+?\d+分)/)?.[1] ?? '';
  const staffPrefix = head.replace(/\d+分$/, '') || t.match(/^[^\d+]+/)?.[0] || '';
  const suffix =
    clientName && clientPhone
      ? `VIP${clientName}${clientPhone}`
      : `${clientName ?? ''}${clientPhone ?? ''}`;
  return {
    topupTitle: `${staffPrefix}儲值+${topup}、${topup}${suffix.startsWith('VIP') ? suffix : `VIP${suffix}`}`,
    usageTitle: `${head}-${usage}、${balanceAfter}${suffix.startsWith('VIP') ? suffix : `VIP${suffix}`}`,
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

async function loadExistingGcalNotes(storeId: StoreSlug): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const notes = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select('member_note')
      .eq('store_id', storeId)
      .like('member_note', 'gcal:%')
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const note = row.member_note as string;
      if (note) notes.add(note.split(':').slice(0, 2).join(':')); // gcal:EVENT_ID
    }
    if (!data?.length || data.length < 1000) break;
    offset += 1000;
  }
  return notes;
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

function applyTitleBalanceIfMissing(
  title: string,
  category: TransactionCategory,
  amount: number,
  balanceAfter: number,
  clientName: string | null,
  clientPhone: string | null,
): string {
  if (parseBalanceAfter顿号(stripAllSpaces(title)) !== null) return title;
  if (!['會員儲值', '會員使用', '會員補差額'].includes(category)) return title;

  const t = stripAllSpaces(title);
  const vipSuffix =
    clientName && clientPhone
      ? `VIP${clientName}${clientPhone}`
      : t.match(/VIP.+$/)?.[0] ?? '';

  const head = t.match(/^(.+?\d+分)/)?.[1] ?? t.match(/^(.+?)(?=\+|-|\d)/)?.[1] ?? '';

  if (category === '會員使用') {
    return `${head}-${amount}、${balanceAfter}${vipSuffix}`;
  }
  if (category === '會員儲值') {
    if (/\+(\d+)-(\d+)/.test(t)) {
      return t.replace(/、(\d+)VIP/i, `、${balanceAfter}VIP`);
    }
    return `${head}+${amount}、${balanceAfter}${vipSuffix}`;
  }
  return title;
}

function auditRowBalance(
  row: TxInsert,
  memberRows: MemberBalanceRow[],
  pendingRows: TxInsert[],
): BalanceMismatchRow | null {
  if (!row.client_phone) return null;
  if (!['會員儲值', '會員使用', '會員補差額'].includes(row.category)) return null;

  const titleBalance = parseBalanceAfter顿号(stripAllSpaces(row.title));
  if (titleBalance === null) return null;

  const combined: MemberBalanceRow[] = [
    ...memberRows,
    ...pendingRows
      .filter((p) => p.client_phone === row.client_phone)
      .map((p, i) => ({
        id: `pending-${i}`,
        occurred_on: p.occurred_on,
        title: p.title,
        amount: p.amount,
        category: p.category,
        client_name: p.client_name,
        client_phone: p.client_phone,
      })),
    {
      id: 'new',
      occurred_on: row.occurred_on,
      title: row.title,
      amount: row.amount,
      category: row.category,
      client_name: row.client_name,
      client_phone: row.client_phone,
    },
  ];

  const computed = clientMemberBalance(combined, row.client_phone);
  if (computed === null || computed === titleBalance) return null;

  return {
    eventId: row.member_note.replace(/^gcal:([^:]+).*$/, '$1'),
    occurredOn: row.occurred_on,
    title: row.title,
    category: row.category,
    amount: row.amount,
    titleBalance,
    computedBalance: computed,
    clientPhone: row.client_phone,
  };
}

function buildRowsFromEvent(
  ev: GoogleCalendarEvent,
  storeId: StoreSlug,
  memberRows: MemberBalanceRow[],
  pendingInserts: TxInsert[],
): TxInsert[] {
  const payment = COLOR_TO_PAYMENT[ev.colorId ?? ''];
  if (!payment) return [];

  const title = ev.summary?.trim() ?? '';
  if (!title) return [];

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
    const finalFromTitle =
      'finalBalance' in compound && compound.finalBalance > 0
        ? compound.finalBalance
        : afterUsage;

    const { topupTitle, usageTitle } = buildCalendarSplitTitles(
      title,
      topup,
      usage,
      client.name,
      client.phone,
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
    skippedPending: 0,
    errors: [],
    titles: [],
    balanceMismatches: [],
  };

  const events = await fetchCalendarEventsInRange(timeMin, timeMax);
  result.scanned = events.length;

  const checkoutEvents = events
    .filter((ev) => {
      if (ev.status === 'cancelled') return false;
      const color = ev.colorId ?? '';
      if (color === '8' || color === '') return false;
      return color in COLOR_TO_PAYMENT;
    })
    .sort(
      (a, b) =>
        new Date(eventStartIso(a)).getTime() - new Date(eventStartIso(b)).getTime(),
    );

  result.checkoutColored = checkoutEvents.length;

  const existingNotes = await loadExistingGcalNotes(storeId);
  const memberRows = await loadMemberRowsForBalance(storeId);
  const pendingInserts: TxInsert[] = [];
  const supabase = getSupabaseAdmin();

  for (const ev of checkoutEvents) {
    const noteKey = `gcal:${ev.id}`;
    if (existingNotes.has(noteKey)) {
      result.skippedExisting++;
      continue;
    }

    try {
      const rows = buildRowsFromEvent(ev, storeId, memberRows, pendingInserts);
      if (!rows.length) {
        result.skippedPending++;
        continue;
      }

      for (const row of rows) {
        const mismatch = auditRowBalance(row, memberRows, pendingInserts);
        if (mismatch) result.balanceMismatches.push(mismatch);
      }

      if (options.dryRun) {
        result.imported += rows.length;
        result.titles.push(ev.summary ?? ev.id);
        pendingInserts.push(...rows);
        continue;
      }

      const { error } = await supabase.from('daily_transactions').insert(rows);
      if (error) {
        result.errors.push(`[${ev.summary}] 寫入失敗：${error.message}`);
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
      pendingInserts.push(...rows);
      existingNotes.add(noteKey);
      result.imported += rows.length;
      result.titles.push(ev.summary ?? ev.id);
    } catch (e) {
      result.errors.push(
        `[${ev.summary ?? ev.id}] ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}

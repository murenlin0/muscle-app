import {
  getGoogleCalendarId,
  getGoogleRefreshToken,
  isGoogleCalendarReady,
} from '@/lib/integration-settings';
import { refreshGoogleAccessToken } from '@/lib/google-oauth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarEventStatus, getCalendarEventSummary, patchCalendarEventSummary } from '@/lib/google-calendar';
import {
  applyTitleBalanceIfMissing,
  patchGoogleCalendarTitleIfNeeded,
} from '@/lib/calendar-title-patch';
import { parseStaffPrefixFromCalendarTitle, resolveStoreSlugFromStaffName } from '@/lib/booking-message';
import { parseCompoundVipTitle } from '@/lib/ledger-title-fix';
import {
  clientMemberBalance,
  memberRowSignedAmount,
  type MemberBalanceRow,
} from '@/lib/ledger-title-balance';
import { canonicalStaffName } from '@/lib/multi-staff-split';
import { normalizeStaffName } from '@/lib/notion-title-normalize';
import { findStaffByName, listActiveStaffForRoster } from '@/lib/staff-auth-server';
import { formatStoreDateIso } from '@/lib/store-timezone';
import type { StoreSlug } from '@/lib/stores';
import type { TransactionCategory } from '@/lib/transaction-category';
import {
  calendarTitleHasCheckoutAmounts,
  minutesFromCalendarTitle,
  phoneFromTitle,
} from '@/lib/calendar-report-match';

/**
 * 簡易合寫解析：只要標題含 +N-M 就視為「儲值 N + 使用 M」
 * 用於師傅 UI 日曆標題（不帶 VIP 後綴），
 * 例如「仁60分+4000-1000林慕仁0978542704」
 */
function parseSimpleTopupUsage(
  title: string,
): { topup: number; usage: number } | null {
  const t = title.replace(/\s/g, '');
  const m = t.match(/\+(\d+)-(\d+)/);
  if (!m) return null;
  const topup = Number(m[1]);
  const usage = Number(m[2]);
  if (!topup || !usage) return null;
  return { topup, usage };
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

function calendarCheckoutNote(
  eventId: string,
  part: 'topup' | 'usage' | 'single',
): string {
  return `gcal:${eventId}:${part}`;
}

async function hasCalendarCheckoutRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_transactions')
    .select('id')
    .like('member_note', `gcal:${eventId}:%`)
    .limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
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

/**
 * 單次結帳標題金額（無 +儲值-使用 合寫）：
 *   現金／轉帳：仁120分2100林慕仁0978542704 → 2100
 *   純會員使用：仁60分-1000林慕仁0978542704 → 1000
 */
function parseSingleCheckoutAmount(
  title: string,
  category: TransactionCategory,
): number {
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

export interface CalendarRepairInput {
  storeId: StoreSlug;
  occurredOn: string;
  phone: string;
}

/** 刪除指定日期的日曆同步流水帳，並重設 appointment 為待結帳 */
export async function repairCalendarCheckout(
  input: CalendarRepairInput,
): Promise<{ deletedTx: number; resetAppts: number }> {
  const supabase = getSupabaseAdmin();
  const { storeId, occurredOn, phone } = input;

  const { data: txs, error: txErr } = await supabase
    .from('daily_transactions')
    .select('id')
    .eq('store_id', storeId)
    .eq('occurred_on', occurredOn)
    .or(`client_phone.eq.${phone},title.ilike.%${phone}%`);

  if (txErr) throw new Error(txErr.message);

  let deletedTx = 0;
  if (txs?.length) {
    const { error } = await supabase
      .from('daily_transactions')
      .delete()
      .in(
        'id',
        txs.map((r) => r.id as string),
      );
    if (error) throw new Error(error.message);
    deletedTx = txs.length;
  }

  const dayStart = `${occurredOn}T00:00:00+08:00`;
  const dayEnd = `${occurredOn}T23:59:59+08:00`;
  const { data: appts, error: apErr } = await supabase
    .from('appointments')
    .select('id')
    .eq('store_id', storeId)
    .gte('starts_at', dayStart)
    .lt('starts_at', dayEnd)
    .or(`calendar_title.ilike.%${phone}%`);

  if (apErr) throw new Error(apErr.message);

  let resetAppts = 0;
  if (appts?.length) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'pending_checkout' })
      .in(
        'id',
        appts.map((a) => a.id as string),
      );
    if (error) throw new Error(error.message);
    resetAppts = appts.length;
  }

  return { deletedTx, resetAppts };
}

/**
 * Google Calendar colorId → 付款方式 + 類型
 *
 * 師傅在日曆結帳時用顏色表示付款方式：
 *   5 (黃/Banana)   = 現金
 *   7 (藍/Peacock)  = 富邦（轉帳）
 *   3 (紫/Grape)    = 會員使用
 *
 * 灰 (8/Graphite) 為待結帳，不在此處理。
 */
const COLOR_TO_PAYMENT: Record<
  string,
  { methods: string[]; defaultCategory: TransactionCategory }
> = {
  '5': { methods: ['現金'], defaultCategory: '一般消費' },   // 現金
  '7': { methods: ['富邦'], defaultCategory: '一般消費' },   // 轉帳
  '9': { methods: ['富邦'], defaultCategory: '一般消費' },   // Blueberry 深藍也算轉帳
  '3': { methods: [], defaultCategory: '會員使用' },          // 純會員使用
};

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  colorId?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  updated: string;
  status?: string;
}

export interface CalendarSyncResult {
  processed: number;
  skipped: number;
  errors: string[];
  titles: string[];
}

export interface CalendarDeletionSyncResult {
  cancelled: number;
  errors: string[];
  titles: string[];
}

export interface CalendarStaffSyncResult {
  updated: number;
  errors: string[];
  titles: string[];
}

export interface CalendarReportStaffSyncResult {
  updated: number;
  errors: string[];
  titles: string[];
}

function resolveStaffDisplayNameFromTitle(title: string): string | null {
  const prefix = parseStaffPrefixFromCalendarTitle(title);
  if (!prefix) return null;
  const normalized = normalizeStaffName(prefix) ?? prefix;
  return canonicalStaffName(normalized);
}

async function resolveStaffRecordFromTitle(
  storeId: StoreSlug,
  title: string,
): Promise<{ id: string; display_name: string } | null> {
  const displayName = resolveStaffDisplayNameFromTitle(title);
  if (!displayName) return null;

  const staff = await findStaffByName(storeId, displayName);
  if (staff) return staff;

  const prefix = parseStaffPrefixFromCalendarTitle(title);
  if (prefix && prefix !== displayName) {
    return findStaffByName(storeId, prefix);
  }

  return null;
}

async function fetchRecentCalendarEvents(
  lookbackHours: number,
  fields = 'items(id,summary,colorId,start,end,updated,status)',
): Promise<GoogleCalendarEvent[]> {
  const calendarId = await getGoogleCalendarId();
  if (!calendarId) throw new Error('缺少 GOOGLE_CALENDAR_ID');

  const refreshToken = await getGoogleRefreshToken();
  if (!refreshToken) throw new Error('尚未完成 Google OAuth 授權');

  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const updatedMin = new Date(
    Date.now() - lookbackHours * 3600 * 1000,
  ).toISOString();

  const params = new URLSearchParams({
    updatedMin,
    singleEvents: 'true',
    maxResults: '250',
    fields,
  });

  const calRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!calRes.ok) {
    const err = (await calRes.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? 'Google Calendar API 回傳錯誤');
  }

  const calData = (await calRes.json()) as { items?: GoogleCalendarEvent[] };
  return calData.items ?? [];
}

/**
 * 日曆事件被刪除 → 取消師傅 UI 建立的待結帳預約（客人 LIFF 不再顯示）。
 * 不修改 daily_transactions（Notion／舊報表資料不受影響）。
 */
export async function syncCalendarDeletedAppointments(
  lookbackHours = 72,
): Promise<CalendarDeletionSyncResult> {
  const result: CalendarDeletionSyncResult = {
    cancelled: 0,
    errors: [],
    titles: [],
  };

  const calendarId = await getGoogleCalendarId();
  if (!calendarId) throw new Error('缺少 GOOGLE_CALENDAR_ID');

  const refreshToken = await getGoogleRefreshToken();
  if (!refreshToken) throw new Error('尚未完成 Google OAuth 授權');

  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const supabase = getSupabaseAdmin();

  const { data: pending, error: pendingErr } = await supabase
    .from('appointments')
    .select('id, calendar_event_id, calendar_title')
    .eq('status', 'pending_checkout')
    .not('calendar_event_id', 'is', null)
    .not('created_by_staff_id', 'is', null);

  if (pendingErr) throw new Error(pendingErr.message);
  if (!pending?.length) return result;

  const pendingByEventId = new Map(
    pending.map((a) => [a.calendar_event_id as string, a]),
  );
  const toCancel = new Map<string, { id: string; title: string }>();

  const updatedMin = new Date(
    Date.now() - lookbackHours * 3600 * 1000,
  ).toISOString();

  const params = new URLSearchParams({
    updatedMin,
    singleEvents: 'true',
    showDeleted: 'true',
    maxResults: '250',
    fields: 'items(id,summary,status)',
  });

  const calRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!calRes.ok) {
    const err = (await calRes.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? 'Google Calendar API 回傳錯誤');
  }

  const calData = (await calRes.json()) as { items?: GoogleCalendarEvent[] };
  for (const ev of calData.items ?? []) {
    if (ev.status !== 'cancelled') continue;
    const appt = pendingByEventId.get(ev.id);
    if (!appt) continue;
    toCancel.set(appt.id as string, {
      id: appt.id as string,
      title: (appt.calendar_title as string | null) ?? ev.summary ?? ev.id,
    });
  }

  for (const appt of toCancel.values()) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appt.id)
      .eq('status', 'pending_checkout');

    if (error) {
      result.errors.push(`[${appt.title}] 取消預約失敗：${error.message}`);
      continue;
    }

    result.cancelled++;
    result.titles.push(appt.title);
  }

  // 補查：待結帳預約若日曆已不存在（含較早刪除、超出 updatedMin）
  for (const appt of pending) {
    if (toCancel.has(appt.id as string)) continue;
    try {
      const outcome = await cancelPendingIfCalendarGone({
        id: appt.id as string,
        calendar_event_id: appt.calendar_event_id as string,
        calendar_title: appt.calendar_title as string | null,
      });
      if (outcome === 'cancelled') {
        result.cancelled++;
        result.titles.push(
          (appt.calendar_title as string | null) ??
            (appt.calendar_event_id as string),
        );
      }
    } catch (e) {
      result.errors.push(
        `[${appt.calendar_title ?? appt.calendar_event_id}] 查詢日曆失敗：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  return result;
}

type PendingCalendarAppt = {
  id: string;
  calendar_event_id: string;
  calendar_title: string | null;
};

async function cancelPendingIfCalendarGone(
  appt: PendingCalendarAppt,
): Promise<'cancelled' | 'active' | 'error'> {
  const supabase = getSupabaseAdmin();
  const eventId = appt.calendar_event_id;

  try {
    const status = await getCalendarEventStatus(eventId);
    if (status === 'active') return 'active';

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appt.id)
      .eq('status', 'pending_checkout');

    if (error) throw new Error(error.message);
    return 'cancelled';
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * 客人開啟儲值金頁時：只檢查該客人的待結帳預約，
 * 日曆事件已刪除 → 立即取消（不需等 Cron／Webhook）。
 */
export async function syncClientCalendarDeletions(
  clientId: string,
): Promise<{ cancelled: number; errors: string[] }> {
  const result = { cancelled: 0, errors: [] as string[] };

  if (!(await isGoogleCalendarReady())) return result;

  const supabase = getSupabaseAdmin();
  const { data: pending, error } = await supabase
    .from('appointments')
    .select('id, calendar_event_id, calendar_title')
    .eq('client_id', clientId)
    .eq('status', 'pending_checkout')
    .not('calendar_event_id', 'is', null)
    .not('created_by_staff_id', 'is', null);

  if (error) throw new Error(error.message);
  if (!pending?.length) return result;

  for (const row of pending) {
    const appt: PendingCalendarAppt = {
      id: row.id as string,
      calendar_event_id: row.calendar_event_id as string,
      calendar_title: row.calendar_title as string | null,
    };
    try {
      const outcome = await cancelPendingIfCalendarGone(appt);
      if (outcome === 'cancelled') result.cancelled++;
    } catch (e) {
      result.errors.push(
        `[${appt.calendar_title ?? appt.calendar_event_id}] ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  return result;
}

async function applyPendingStaffFromCalendarTitle(
  appt: {
    id: string;
    store_id: string;
    calendar_title: string | null;
    staff_id: string | null;
  },
  newTitle: string,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  result: CalendarStaffSyncResult,
): Promise<void> {
  if (!newTitle || newTitle === appt.calendar_title) return;

  const storeId = appt.store_id as StoreSlug;
  const staff = await resolveStaffRecordFromTitle(storeId, newTitle);

  const payload: {
    calendar_title: string;
    staff_id?: string;
  } = { calendar_title: newTitle };
  if (staff) payload.staff_id = staff.id;

  const { error: updateErr } = await supabase
    .from('appointments')
    .update(payload)
    .eq('id', appt.id)
    .eq('status', 'pending_checkout');

  if (updateErr) {
    result.errors.push(`[${newTitle}] 更新師傅失敗：${updateErr.message}`);
    return;
  }

  result.updated++;
  result.titles.push(newTitle);
}

/**
 * 待結帳：日曆標題改師傅 → 更新 appointments.staff_id / calendar_title（客人端同步顯示）。
 */
export async function syncCalendarPendingStaffChanges(
  lookbackHours = 72,
  clientId?: string,
): Promise<CalendarStaffSyncResult> {
  const result: CalendarStaffSyncResult = {
    updated: 0,
    errors: [],
    titles: [],
  };

  if (!(await isGoogleCalendarReady())) return result;

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('appointments')
    .select('id, store_id, calendar_event_id, calendar_title, staff_id')
    .eq('status', 'pending_checkout')
    .not('calendar_event_id', 'is', null)
    .not('created_by_staff_id', 'is', null);

  if (clientId) query = query.eq('client_id', clientId);

  const { data: pending, error } = await query;
  if (error) throw new Error(error.message);
  if (!pending?.length) return result;

  if (clientId) {
    for (const appt of pending) {
      try {
        const event = await getCalendarEventSummary(appt.calendar_event_id as string);
        if (event.status !== 'active' || !event.summary) continue;
        await applyPendingStaffFromCalendarTitle(
          appt as {
            id: string;
            store_id: string;
            calendar_title: string | null;
            staff_id: string | null;
          },
          event.summary.trim(),
          supabase,
          result,
        );
      } catch (e) {
        result.errors.push(
          `[${appt.calendar_title ?? appt.calendar_event_id}] ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    return result;
  }

  const pendingByEventId = new Map(
    pending.map((a) => [a.calendar_event_id as string, a]),
  );

  let events: GoogleCalendarEvent[];
  try {
    events = await fetchRecentCalendarEvents(lookbackHours);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }

  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    const appt = pendingByEventId.get(ev.id);
    if (!appt) continue;

    const newTitle = ev.summary?.trim();
    if (!newTitle) continue;

    await applyPendingStaffFromCalendarTitle(
      appt as {
        id: string;
        store_id: string;
        calendar_title: string | null;
        staff_id: string | null;
      },
      newTitle,
      supabase,
      result,
    );
  }

  return result;
}

/**
 * 依日曆標題前綴更新報表 staff_name（gcal 連結列，或同日同客戶列）。
 */
export async function updateReportStaffFromCalendarEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    storeId: StoreSlug;
    eventId: string;
    title: string;
    occurredOn: string;
  },
): Promise<number> {
  const { storeId, eventId, title, occurredOn } = params;
  const newStaffName = resolveStaffDisplayNameFromTitle(title);
  if (!newStaffName) return 0;

  const { data: linked, error: linkedErr } = await supabase
    .from('daily_transactions')
    .select('id, staff_name')
    .eq('store_id', storeId)
    .like('member_note', `gcal:${eventId}:%`);

  if (linkedErr) throw new Error(linkedErr.message);

  const ids = new Set<string>();
  const phone = phoneFromTitle(title);

  if (linked?.length) {
    for (const tx of linked) {
      if ((tx.staff_name as string | null) !== newStaffName) {
        ids.add(tx.id as string);
      }
    }
  } else if (phone) {
    const { data: phoneTxs, error: phoneErr } = await supabase
      .from('daily_transactions')
      .select('id, staff_name, title')
      .eq('store_id', storeId)
      .eq('occurred_on', occurredOn)
      .or(`client_phone.eq.${phone},title.ilike.%${phone}%`);

    if (phoneErr) throw new Error(phoneErr.message);

    const staffRenameOnly = !calendarTitleHasCheckoutAmounts(title);
    const mins = minutesFromCalendarTitle(title);

    for (const tx of phoneTxs ?? []) {
      if ((tx.staff_name as string | null) === newStaffName) continue;
      if (staffRenameOnly) {
        if (mins && !(tx.title as string).includes(`${mins}分`)) continue;
        ids.add(tx.id as string);
      } else {
        ids.add(tx.id as string);
      }
    }
  }

  if (!ids.size) return 0;

  const { error: updateErr } = await supabase
    .from('daily_transactions')
    .update({ staff_name: newStaffName })
    .in('id', [...ids]);

  if (updateErr) throw new Error(updateErr.message);
  return ids.size;
}

/**
 * 已結帳：日曆標題事後改師傅 → 更新 daily_transactions.staff_name（報表同步）。
 */
export async function syncCalendarCompletedStaffRenames(
  lookbackHours = 72,
): Promise<CalendarReportStaffSyncResult> {
  const result: CalendarReportStaffSyncResult = {
    updated: 0,
    errors: [],
    titles: [],
  };

  if (!(await isGoogleCalendarReady())) return result;

  const supabase = getSupabaseAdmin();
  const roster = await listActiveStaffForRoster();

  const { data: appts, error: apptErr } = await supabase
    .from('appointments')
    .select('calendar_event_id, store_id')
    .not('calendar_event_id', 'is', null);

  if (apptErr) throw new Error(apptErr.message);

  const storeByEventId = new Map(
    (appts ?? []).map((a) => [a.calendar_event_id as string, a.store_id as StoreSlug]),
  );

  let events: GoogleCalendarEvent[];
  try {
    events = await fetchRecentCalendarEvents(lookbackHours);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }

  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    const color = ev.colorId ?? '';
    if (!(color in COLOR_TO_PAYMENT)) continue;

    const title = ev.summary?.trim();
    if (!title) continue;
    if (!resolveStaffDisplayNameFromTitle(title)) continue;

    const occurredOn = formatStoreDateIso(
      ev.start.dateTime
        ? new Date(ev.start.dateTime)
        : new Date(ev.start.date ?? Date.now()),
    );

    const storeId =
      storeByEventId.get(ev.id) ??
      resolveStoreSlugFromStaffName(resolveStaffDisplayNameFromTitle(title), roster);
    if (!storeId) continue;

    try {
      const count = await updateReportStaffFromCalendarEvent(supabase, {
        storeId,
        eventId: ev.id,
        title,
        occurredOn,
      });
      if (count > 0) {
        result.updated += count;
        result.titles.push(title);
      }
    } catch (e) {
      result.errors.push(
        `[${title}] 更新報表師傅失敗：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}

/**
 * 客人開啟儲值金頁：日曆刪除取消預約 + 日曆改師傅同步待結帳。
 */
export async function syncClientCalendarAppointments(
  clientId: string,
  lookbackHours = 72,
): Promise<{
  cancelled: number;
  staffUpdated: number;
  errors: string[];
}> {
  const deletions = await syncClientCalendarDeletions(clientId);
  let staffUpdated = 0;
  const errors = [...deletions.errors];

  try {
    const staff = await syncCalendarPendingStaffChanges(lookbackHours, clientId);
    staffUpdated = staff.updated;
    errors.push(...staff.errors);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return {
    cancelled: deletions.cancelled,
    staffUpdated,
    errors,
  };
}

/**
 * 同步 Google 日曆結帳事件 → daily_transactions
 *
 * 只處理：
 *   1. calendar_event_id 存在於 appointments（師傅 UI 建立）
 *   2. appointments.status = 'pending_checkout'
 *   3. 事件顏色已從灰（8）改為 COLOR_TO_PAYMENT 中的顏色
 *
 * @param lookbackHours 往前回溯多少小時的「最近更新」事件（預設 72hr）
 */
export async function syncCalendarCheckouts(
  lookbackHours = 72,
): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = {
    processed: 0,
    skipped: 0,
    errors: [],
    titles: [],
  };

  const calendarId = await getGoogleCalendarId();
  if (!calendarId) throw new Error('缺少 GOOGLE_CALENDAR_ID');

  const refreshToken = await getGoogleRefreshToken();
  if (!refreshToken) throw new Error('尚未完成 Google OAuth 授權');

  const accessToken = await refreshGoogleAccessToken(refreshToken);
  const supabase = getSupabaseAdmin();

  // 取得最近更新的事件（只拿需要的欄位）
  const updatedMin = new Date(
    Date.now() - lookbackHours * 3600 * 1000,
  ).toISOString();

  const params = new URLSearchParams({
    updatedMin,
    singleEvents: 'true',
    maxResults: '250',
    fields: 'items(id,summary,colorId,start,end,updated,status)',
  });

  const calRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!calRes.ok) {
    const err = (await calRes.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? 'Google Calendar API 回傳錯誤');
  }

  const calData = (await calRes.json()) as { items?: GoogleCalendarEvent[] };
  const events = calData.items ?? [];

  // 篩選：顏色已換成結帳色（非灰、非預設）
  const checkoutEvents = events.filter((ev) => {
    if (ev.status === 'cancelled') return false;
    const color = ev.colorId ?? '';
    return color in COLOR_TO_PAYMENT;
  });

  if (checkoutEvents.length === 0) return result;

  // 比對 appointments（只處理 pending_checkout）
  const eventIds = checkoutEvents.map((e) => e.id);
  const { data: appointments, error: apptErr } = await supabase
    .from('appointments')
    .select(
      'id, store_id, calendar_event_id, calendar_title, starts_at, staff_id, client_id',
    )
    .in('calendar_event_id', eventIds)
    .eq('status', 'pending_checkout');

  if (apptErr) throw new Error(apptErr.message);
  if (!appointments?.length) return result;

  const apptByEventId = new Map(
    appointments.map((a) => [a.calendar_event_id as string, a]),
  );

  const clientIds = [
    ...new Set(appointments.map((a) => a.client_id).filter(Boolean)),
  ] as string[];

  const clientMap = new Map<
    string,
    { name: string; phone: string; is_vip: boolean }
  >();

  if (clientIds.length) {
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, is_vip')
      .in('id', clientIds);
    for (const row of data ?? [])
      clientMap.set(row.id as string, row as { name: string; phone: string; is_vip: boolean });
  }

  // 處理每筆結帳事件
  type TxRow = {
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

  const memberRowsByStore = new Map<StoreSlug, MemberBalanceRow[]>();
  const pendingByStore = new Map<StoreSlug, TxRow[]>();

  for (const ev of checkoutEvents) {
    const appt = apptByEventId.get(ev.id);
    if (!appt) {
      result.skipped++;
      continue;
    }

    try {
      if (await hasCalendarCheckoutRows(supabase, ev.id)) {
        result.skipped++;
        continue;
      }

      const payment = COLOR_TO_PAYMENT[ev.colorId ?? ''];
      if (!payment) {
        result.skipped++;
        continue;
      }

      const title = ev.summary ?? (appt.calendar_title as string | null) ?? '';
      const storeId = appt.store_id as StoreSlug;
      // 人員只看日曆標題前綴（如「仁60分」→ 仁），不用師傅 UI 建立預約的人
      const staffName = resolveStaffDisplayNameFromTitle(title);
      const client = appt.client_id
        ? clientMap.get(appt.client_id as string) ?? null
        : null;

      const startsAt = ev.start.dateTime
        ? new Date(ev.start.dateTime)
        : new Date(appt.starts_at as string);
      const occurredOn = formatStoreDateIso(startsAt);

      // 嘗試解析合寫標題（+儲值-使用，拆成兩筆）
      // 先用完整 VIP 格式（仁60分+4000-1000、3000VIP...），
      // 再 fallback 到簡單格式（仁60分+4000-1000林慕仁...，無 VIP 後綴）
      const compound =
        parseCompoundVipTitle(title) ?? parseSimpleTopupUsage(title);

      const rowsToInsert: TxRow[] = [];
      let calendarPatch:
        | { topup: number; usage: number; balanceAfterUsage: number }
        | { usage: number; balanceAfterUsage: number }
        | null = null;

      if (compound) {
        if (!memberRowsByStore.has(storeId)) {
          memberRowsByStore.set(storeId, await loadMemberRowsForBalance(storeId));
        }
        const memberRows = memberRowsByStore.get(storeId)!;
        const pending = pendingByStore.get(storeId) ?? [];
        const phone = client?.phone ?? null;

        let prior = 0;
        if (phone) {
          prior =
            (clientMemberBalance(memberRows, phone) ?? 0) +
            pending
              .filter((p) => p.client_phone === phone)
              .reduce((s, p) => s + memberRowSignedAmount(p.category, p.amount), 0);
        }

        const afterTopup = prior + compound.topup;
        const parsedCompound = parseCompoundVipTitle(title);
        const afterUsage =
          parsedCompound && parsedCompound.finalBalance > 0
            ? parsedCompound.finalBalance
            : prior + compound.topup - compound.usage;

        const topupMethods =
          payment.methods.length ? payment.methods : ['現金'];
        const { topupTitle, usageTitle } = buildCalendarSplitTitles(
          title,
          compound.topup,
          compound.usage,
          client?.name ?? null,
          client?.phone ?? null,
          afterTopup,
          afterUsage,
        );
        rowsToInsert.push({
          store_id: storeId,
          occurred_on: occurredOn,
          title: applyTitleBalanceIfMissing(
            topupTitle,
            '會員儲值',
            compound.topup,
            afterTopup,
            client?.name ?? null,
            client?.phone ?? null,
          ),
          amount: compound.topup,
          category: '會員儲值',
          payment_methods: topupMethods,
          staff_name: staffName,
          client_name: client?.name ?? null,
          client_phone: client?.phone ?? null,
          is_vip: client?.is_vip ?? true,
          source: 'calendar_sync',
          member_note: calendarCheckoutNote(ev.id, 'topup'),
        });
        rowsToInsert.push({
          store_id: storeId,
          occurred_on: occurredOn,
          title: applyTitleBalanceIfMissing(
            usageTitle,
            '會員使用',
            compound.usage,
            afterUsage,
            client?.name ?? null,
            client?.phone ?? null,
          ),
          amount: compound.usage,
          category: '會員使用',
          payment_methods: [],
          staff_name: staffName,
          client_name: client?.name ?? null,
          client_phone: client?.phone ?? null,
          is_vip: client?.is_vip ?? true,
          source: 'calendar_sync',
          member_note: calendarCheckoutNote(ev.id, 'usage'),
        });
        calendarPatch = {
          topup: compound.topup,
          usage: compound.usage,
          balanceAfterUsage: afterUsage,
        };
      } else {
        const amount = parseSingleCheckoutAmount(title, payment.defaultCategory);
        let finalTitle = title;
        let balanceAfterUsage: number | null = null;

        if (payment.defaultCategory === '會員使用' && client?.phone) {
          if (!memberRowsByStore.has(storeId)) {
            memberRowsByStore.set(storeId, await loadMemberRowsForBalance(storeId));
          }
          const memberRows = memberRowsByStore.get(storeId)!;
          const pending = pendingByStore.get(storeId) ?? [];
          const prior =
            (clientMemberBalance(memberRows, client.phone) ?? 0) +
            pending
              .filter((p) => p.client_phone === client.phone)
              .reduce((s, p) => s + memberRowSignedAmount(p.category, p.amount), 0);
          balanceAfterUsage = prior - amount;
          finalTitle = applyTitleBalanceIfMissing(
            title,
            '會員使用',
            amount,
            balanceAfterUsage,
            client.name ?? null,
            client.phone,
          );
        }

        rowsToInsert.push({
          store_id: storeId,
          occurred_on: occurredOn,
          title: finalTitle,
          amount,
          category: payment.defaultCategory,
          payment_methods: payment.methods,
          staff_name: staffName,
          client_name: client?.name ?? null,
          client_phone: client?.phone ?? null,
          is_vip: client?.is_vip ?? false,
          source: 'calendar_sync',
          member_note: calendarCheckoutNote(ev.id, 'single'),
        });
        if (balanceAfterUsage !== null) {
          calendarPatch = { usage: amount, balanceAfterUsage };
        }
      }

      // 先鎖定 appointment，避免 webhook 與手動同步同時寫入兩筆
      const { data: claimed, error: claimErr } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', appt.id)
        .eq('status', 'pending_checkout')
        .select('id')
        .maybeSingle();
      if (claimErr) {
        result.errors.push(`[${title}] 鎖定預約失敗：${claimErr.message}`);
        continue;
      }
      if (!claimed) {
        result.skipped++;
        continue;
      }

      // 寫入 daily_transactions
      const { error: insertErr } = await supabase
        .from('daily_transactions')
        .insert(rowsToInsert);
      if (insertErr) {
        await supabase
          .from('appointments')
          .update({ status: 'pending_checkout' })
          .eq('id', appt.id);
        result.errors.push(`[${title}] 寫入失敗：${insertErr.message}`);
        continue;
      }

      if (!memberRowsByStore.has(storeId)) {
        memberRowsByStore.set(storeId, await loadMemberRowsForBalance(storeId));
      }
      const memberRows = memberRowsByStore.get(storeId)!;
      for (const row of rowsToInsert) {
        memberRows.push({
          occurred_on: row.occurred_on,
          title: row.title,
          amount: row.amount,
          category: row.category,
          client_name: row.client_name,
          client_phone: row.client_phone,
        });
      }
      const pending = pendingByStore.get(storeId) ?? [];
      pending.push(...rowsToInsert);
      pendingByStore.set(storeId, pending);

      // 原標題缺、餘額 → 回寫 Google 日曆
      if (calendarPatch) {
        await patchGoogleCalendarTitleIfNeeded(ev.id, title, {
          ...calendarPatch,
          clientName: client?.name ?? null,
          clientPhone: client?.phone ?? null,
        }).then(async (patched) => {
          if (patched) {
            await supabase
              .from('appointments')
              .update({ calendar_title: patched })
              .eq('id', appt.id);
          }
        });
      }

      // 有儲值 → 升級客人為 VIP（名字前加 VIP、設 is_vip=true）
      // 同時更新日曆事件標題與 appointments.calendar_title
      if (compound && appt.client_id && client) {
        const oldName = client.name as string;
        if (oldName && !oldName.startsWith('VIP')) {
          const vipName = `VIP${oldName}`;
          // 更新客人資料
          await supabase
            .from('clients')
            .update({ is_vip: true, name: vipName })
            .eq('id', appt.client_id);
          // 更新日曆標題（把舊名換成 VIP名）
          const newTitle = title.replace(oldName, vipName);
          if (newTitle !== title) {
            try {
              await patchCalendarEventSummary(ev.id, newTitle);
              await supabase
                .from('appointments')
                .update({ calendar_title: newTitle })
                .eq('id', appt.id);
            } catch {
              // 日曆標題更新非必要，失敗不中斷流程
            }
          }
        } else if (!client.is_vip) {
          // 名字已有 VIP 前綴但旗標尚未設定
          await supabase
            .from('clients')
            .update({ is_vip: true })
            .eq('id', appt.client_id);
        }
      }

      result.processed++;
      result.titles.push(title);
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return result;
}

export interface CalendarAmountRepairResult {
  updated: number;
  errors: string[];
  titles: string[];
}

/** 結帳同步時標題尚未含金額、之後才補 key 的情況：重讀日曆標題並更新 $0 的流水帳 */
export async function repairCalendarCheckoutAmounts(
  lookbackHours = 72,
): Promise<CalendarAmountRepairResult> {
  const result: CalendarAmountRepairResult = { updated: 0, errors: [], titles: [] };
  const supabase = getSupabaseAdmin();
  const since = formatStoreDateIso(
    new Date(Date.now() - lookbackHours * 3600 * 1000),
  );

  const { data: rows, error } = await supabase
    .from('daily_transactions')
    .select('id, title, amount, category, member_note')
    .eq('source', 'calendar_sync')
    .eq('amount', 0)
    .gte('occurred_on', since)
    .like('member_note', 'gcal:%:single');

  if (error) throw new Error(error.message);
  if (!rows?.length) return result;

  for (const row of rows) {
    const note = row.member_note as string | null;
    const eventId = note?.match(/^gcal:([^:]+):single$/)?.[1];
    if (!eventId) continue;

    try {
      const ev = await getCalendarEventSummary(eventId);
      const title = ev.summary?.trim();
      if (!title) continue;

      const amount = parseSingleCheckoutAmount(
        title,
        row.category as TransactionCategory,
      );
      if (!amount) continue;

      const { error: upErr } = await supabase
        .from('daily_transactions')
        .update({ title, amount })
        .eq('id', row.id as string);
      if (upErr) {
        result.errors.push(`[${title}] ${upErr.message}`);
        continue;
      }

      await supabase
        .from('appointments')
        .update({ calendar_title: title })
        .eq('calendar_event_id', eventId);

      result.updated++;
      result.titles.push(title);
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return result;
}

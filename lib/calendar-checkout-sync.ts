import {
  getGoogleCalendarId,
  getGoogleRefreshToken,
} from '@/lib/integration-settings';
import { refreshGoogleAccessToken } from '@/lib/google-oauth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { CALENDAR_COLOR_PENDING } from '@/lib/google-calendar';
import { parseCompoundVipTitle } from '@/lib/ledger-title-fix';
import { formatStoreDateIso } from '@/lib/store-timezone';
import type { StoreSlug } from '@/lib/stores';
import type { TransactionCategory } from '@/lib/transaction-category';

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

  // 批次取 staff / client 資料
  const staffIds = [
    ...new Set(appointments.map((a) => a.staff_id).filter(Boolean)),
  ] as string[];
  const clientIds = [
    ...new Set(appointments.map((a) => a.client_id).filter(Boolean)),
  ] as string[];

  const staffMap = new Map<string, { display_name: string }>();
  const clientMap = new Map<
    string,
    { name: string; phone: string; is_vip: boolean }
  >();

  if (staffIds.length) {
    const { data } = await supabase
      .from('staff')
      .select('id, display_name')
      .in('id', staffIds);
    for (const row of data ?? []) staffMap.set(row.id as string, row as { display_name: string });
  }
  if (clientIds.length) {
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, is_vip')
      .in('id', clientIds);
    for (const row of data ?? [])
      clientMap.set(row.id as string, row as { name: string; phone: string; is_vip: boolean });
  }

  // 處理每筆結帳事件
  for (const ev of checkoutEvents) {
    const appt = apptByEventId.get(ev.id);
    if (!appt) {
      result.skipped++;
      continue;
    }

    try {
      const payment = COLOR_TO_PAYMENT[ev.colorId ?? ''];
      if (!payment) {
        result.skipped++;
        continue;
      }

      const title = ev.summary ?? (appt.calendar_title as string | null) ?? '';
      const storeId = appt.store_id as StoreSlug;
      const staffName =
        appt.staff_id
          ? (staffMap.get(appt.staff_id as string)?.display_name ?? null)
          : null;
      const client = appt.client_id
        ? clientMap.get(appt.client_id as string) ?? null
        : null;

      const startsAt = ev.start.dateTime
        ? new Date(ev.start.dateTime)
        : new Date(appt.starts_at as string);
      const occurredOn = formatStoreDateIso(startsAt);

      // 嘗試解析合寫標題（+儲值-使用，拆成兩筆）
      const compound = parseCompoundVipTitle(title);

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
      };

      const rowsToInsert: TxRow[] = [];

      if (compound) {
        // 有 +N-M 合寫：拆成「會員儲值」+ 「會員使用」
        const topupMethods =
          payment.methods.length ? payment.methods : ['現金'];
        rowsToInsert.push({
          store_id: storeId,
          occurred_on: occurredOn,
          title,
          amount: compound.topup,
          category: '會員儲值',
          payment_methods: topupMethods,
          staff_name: staffName,
          client_name: client?.name ?? null,
          client_phone: client?.phone ?? null,
          is_vip: client?.is_vip ?? true,
          source: 'calendar_sync',
        });
        rowsToInsert.push({
          store_id: storeId,
          occurred_on: occurredOn,
          title,
          amount: compound.usage,
          category: '會員使用',
          payment_methods: [],
          staff_name: staffName,
          client_name: client?.name ?? null,
          client_phone: client?.phone ?? null,
          is_vip: client?.is_vip ?? true,
          source: 'calendar_sync',
        });
      } else {
        // 單一付款（無合寫金額）
        rowsToInsert.push({
          store_id: storeId,
          occurred_on: occurredOn,
          title,
          amount: 0,
          category: payment.defaultCategory,
          payment_methods: payment.methods,
          staff_name: staffName,
          client_name: client?.name ?? null,
          client_phone: client?.phone ?? null,
          is_vip: client?.is_vip ?? false,
          source: 'calendar_sync',
        });
      }

      // 寫入 daily_transactions
      const { error: insertErr } = await supabase
        .from('daily_transactions')
        .insert(rowsToInsert);
      if (insertErr) {
        result.errors.push(`[${title}] 寫入失敗：${insertErr.message}`);
        continue;
      }

      // 更新 appointment 狀態
      const { error: updateErr } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', appt.id);
      if (updateErr) {
        result.errors.push(
          `[${title}] appointment 狀態更新失敗：${updateErr.message}`,
        );
        continue;
      }

      result.processed++;
      result.titles.push(title);
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return result;
}

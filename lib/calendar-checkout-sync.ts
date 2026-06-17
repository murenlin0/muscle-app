import {
  getGoogleCalendarId,
  getGoogleRefreshToken,
} from '@/lib/integration-settings';
import { refreshGoogleAccessToken } from '@/lib/google-oauth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarEventStatus, patchCalendarEventSummary } from '@/lib/google-calendar';
import { parseCompoundVipTitle } from '@/lib/ledger-title-fix';
import { formatStoreDateIso } from '@/lib/store-timezone';
import type { StoreSlug } from '@/lib/stores';
import type { TransactionCategory } from '@/lib/transaction-category';

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

/** 合寫標題拆成儲值列 / 使用列標題 */
function buildCalendarSplitTitles(
  title: string,
  topup: number,
  usage: number,
  clientName: string | null,
  clientPhone: string | null,
): { topupTitle: string; usageTitle: string } {
  const t = title.replace(/\s/g, '');
  const head = t.match(/^(.+?\d+分)/)?.[1] ?? '';
  const staffPrefix = head.replace(/\d+分$/, '') || t.match(/^[^\d+]+/)?.[0] || '';
  const suffix = `${clientName ?? ''}${clientPhone ?? ''}`;
  return {
    topupTitle: `${staffPrefix}儲值+${topup}${suffix}`,
    usageTitle: `${head}-${usage}${suffix}`,
  };
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

  // 補查：待結帳預約若日曆已不存在（含較早刪除、超出 updatedMin）
  for (const appt of pending) {
    if (toCancel.has(appt.id as string)) continue;
    const eventId = appt.calendar_event_id as string;
    try {
      const status = await getCalendarEventStatus(eventId);
      if (status === 'active') continue;
      toCancel.set(appt.id as string, {
        id: appt.id as string,
        title: (appt.calendar_title as string | null) ?? eventId,
      });
    } catch (e) {
      result.errors.push(
        `[${appt.calendar_title ?? eventId}] 查詢日曆失敗：${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
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

  return result;
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
      // 先用完整 VIP 格式（仁60分+4000-1000、3000VIP...），
      // 再 fallback 到簡單格式（仁60分+4000-1000林慕仁...，無 VIP 後綴）
      const compound =
        parseCompoundVipTitle(title) ?? parseSimpleTopupUsage(title);

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
        const topupMethods =
          payment.methods.length ? payment.methods : ['現金'];
        const { topupTitle, usageTitle } = buildCalendarSplitTitles(
          title,
          compound.topup,
          compound.usage,
          client?.name ?? null,
          client?.phone ?? null,
        );
        rowsToInsert.push({
          store_id: storeId,
          occurred_on: occurredOn,
          title: topupTitle,
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
          title: usageTitle,
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

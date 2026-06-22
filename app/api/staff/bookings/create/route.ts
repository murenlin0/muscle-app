import { NextResponse } from 'next/server';
import {
  buildBookingPreview,
  finalizeStaffBooking,
  resolveStoreSlugFromStaffName,
} from '@/lib/booking-message';
import { parseBookingForStaffPreview } from '@/lib/booking-message-parse-server';
import { BookingParseIncompleteError } from '@/lib/booking-message-ai';
import {
  findStaffByName,
  listActiveStaffForRoster,
  upsertClientForBooking,
} from '@/lib/staff-auth-server';
import { createPendingCheckoutEvent } from '@/lib/google-calendar';
import { formatGoogleCalendarErrorMessage } from '@/lib/google-oauth';
import { isGoogleCalendarReady } from '@/lib/integration-settings';
import { requireStaffSession } from '@/lib/portal-api';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (session instanceof NextResponse) return session;

  let body: { text?: string; staffName?: string; staffNote?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.text?.trim()) {
    return NextResponse.json({ error: '請貼上預約訊息' }, { status: 400 });
  }

  try {
    const roster = await listActiveStaffForRoster();
    const storeSlug = resolveStoreSlugFromStaffName(body.staffName, roster);
    if (!storeSlug) {
      return NextResponse.json({ error: '沒有輸入師傅名稱' }, { status: 400 });
    }

    const { data: parsed } = await parseBookingForStaffPreview(body.text, { roster });
    const finalized = finalizeStaffBooking(parsed, {
      staffName: body.staffName,
      staffNote: body.staffNote,
      storeSlug,
    });
    const store = finalized.storeSlug;
    const preview = buildBookingPreview(finalized);
    const staff = await findStaffByName(store, finalized.staffName!);
    if (!staff) {
      return NextResponse.json(
        { error: `找不到師傅「${finalized.staffName}」（${finalized.storeLabel}）` },
        { status: 400 },
      );
    }

    const clientId = await upsertClientForBooking(
      store,
      finalized.phone,
      finalized.clientName,
    );

    const supabase = getSupabaseAdmin();
    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        store_id: store,
        staff_id: staff.id,
        client_id: clientId,
        service_label: finalized.serviceLabel,
        service_duration_minutes: finalized.durationMinutes,
        starts_at: preview.startsAt.toISOString(),
        ends_at: preview.endsAt.toISOString(),
        status: 'pending_checkout',
        calendar_title: preview.calendarTitle,
        note: finalized.note,
        raw_message: body.text.trim(),
        created_by_staff_id: session.staffId,
      })
      .select('id, calendar_event_id, starts_at, ends_at, calendar_title')
      .single();

    if (error) throw new Error(error.message);

    let calendarNote = '已寫入資料庫。';
    let calendarEventId: string | null = null;
    let calendarHtmlLink: string | null = null;

    if (await isGoogleCalendarReady()) {
      try {
        const event = await createPendingCheckoutEvent({
          title: preview.calendarTitle,
          startsAt: preview.startsAt,
          endsAt: preview.endsAt,
          note: finalized.note,
          description: body.text.trim(),
        });
        calendarEventId = event.id;
        calendarHtmlLink = event.htmlLink;
        await supabase
          .from('appointments')
          .update({
            calendar_event_id: event.id,
            calendar_event_etag: event.etag,
          })
          .eq('id', appointment.id);
        calendarNote = '已建立灰色待結帳事件，請至 Google 日曆結帳。';
      } catch (calErr) {
        const raw = calErr instanceof Error ? calErr.message : '未知錯誤';
        calendarNote = `資料庫已建立；日曆失敗：${formatGoogleCalendarErrorMessage(raw)}`;
      }
    } else {
      calendarNote += ' Google 日曆尚未授權，請開 /admin/google 完成串接。';
    }

    return NextResponse.json({
      appointment: { ...appointment, calendar_event_id: calendarEventId },
      calendarNote,
      calendarHtmlLink,
      preview,
    });
  } catch (e) {
    if (e instanceof BookingParseIncompleteError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : '建立失敗';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

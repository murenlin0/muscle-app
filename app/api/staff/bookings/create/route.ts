import { NextResponse } from 'next/server';
import { buildBookingPreview, parseBookingMessage } from '@/lib/booking-message';
import {
  findStaffByName,
  upsertClientForBooking,
} from '@/lib/staff-auth-server';
import { requireStaffSession } from '@/lib/portal-api';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (session instanceof NextResponse) return session;

  let body: { text?: string };
  try {
    body = (await request.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.text?.trim()) {
    return NextResponse.json({ error: '請貼上預約訊息' }, { status: 400 });
  }

  try {
    const parsed = parseBookingMessage(body.text);
    const store = parsed.storeSlug;
    const preview = buildBookingPreview(parsed);
    const staff = await findStaffByName(store, parsed.staffName);
    if (!staff) {
      return NextResponse.json(
        { error: `找不到師傅「${parsed.staffName}」（${parsed.storeLabel}）` },
        { status: 400 },
      );
    }

    const clientId = await upsertClientForBooking(
      store,
      parsed.phone,
      parsed.clientName,
    );

    const supabase = getSupabaseAdmin();
    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        store_id: store,
        staff_id: staff.id,
        client_id: clientId,
        service_label: parsed.serviceLabel,
        service_duration_minutes: parsed.durationMinutes,
        starts_at: preview.startsAt.toISOString(),
        ends_at: preview.endsAt.toISOString(),
        status: 'pending_checkout',
        calendar_title: preview.calendarTitle,
        note: parsed.note,
        raw_message: body.text.trim(),
        created_by_staff_id: session.staffId,
      })
      .select('id, calendar_event_id, starts_at, ends_at, calendar_title')
      .single();

    if (error) throw new Error(error.message);

    const calendarNote =
      '已寫入資料庫。接上 Google Calendar 後將自動建立灰色待結帳事件。';

    return NextResponse.json({
      appointment,
      calendarNote,
      preview,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '建立失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

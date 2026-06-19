import { NextResponse } from 'next/server';
import {
  buildBookingPreview,
  finalizeStaffBooking,
} from '@/lib/booking-message';
import { BookingParseIncompleteError, isGroqConfigured } from '@/lib/booking-message-ai';
import { parseBookingForStaffPreview } from '@/lib/booking-message-parse-server';
import { requireStaffSession } from '@/lib/portal-api';

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
    const { data: parsed, method } = await parseBookingForStaffPreview(body.text);
    const finalized = finalizeStaffBooking(parsed, {
      staffName: body.staffName,
      staffNote: body.staffNote,
    });
    const preview = buildBookingPreview(finalized);

    const now = Date.now();
    const startsMs = preview.startsAt.getTime();
    const minutesFromNow = (startsMs - now) / 60_000;
    if (startsMs < now) {
      return NextResponse.json({ error: `預約時間（${preview.startsAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}）已過，請確認時間` }, { status: 400 });
    }
    if (minutesFromNow < 30) {
      return NextResponse.json({ error: `距現在僅剩 ${Math.round(minutesFromNow)} 分鐘，至少需提前 30 分鐘預約` }, { status: 400 });
    }

    return NextResponse.json({ preview, parsedBy: method, aiProvider: isGroqConfigured() ? 'groq' : 'gemini' });
  } catch (e) {
    if (e instanceof BookingParseIncompleteError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : '無法解析訊息';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import {
  buildBookingPreview,
  finalizeStaffBooking,
  parseBookingMessage,
} from '@/lib/booking-message';
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
    const parsed = parseBookingMessage(body.text);
    const finalized = finalizeStaffBooking(parsed, {
      staffName: body.staffName ?? session.staffName,
      staffNote: body.staffNote,
    });
    const preview = buildBookingPreview(finalized);
    return NextResponse.json({ preview });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法解析訊息';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

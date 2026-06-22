import { NextResponse } from 'next/server';
import {
  buildBookingPreviewForStaffUi,
  mergeStaffUiBooking,
  resolveStoreSlugFromStaffName,
} from '@/lib/booking-message';
import { BookingParseIncompleteError } from '@/lib/booking-message-ai';
import { parseBookingForStaffPreview } from '@/lib/booking-message-parse-server';
import { listActiveStaffForRoster } from '@/lib/staff-auth-server';
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
    const roster = await listActiveStaffForRoster();
    const { data: parsed, method } = await parseBookingForStaffPreview(body.text, { roster });
    const storeSlug = resolveStoreSlugFromStaffName(body.staffName, roster);
    const draft = mergeStaffUiBooking(parsed, {
      staffName: body.staffName,
      staffNote: body.staffNote,
      storeSlug,
    });
    const preview = buildBookingPreviewForStaffUi(draft);
    return NextResponse.json({ preview, parsedBy: method, aiProvider: 'gemini' });
  } catch (e) {
    if (e instanceof BookingParseIncompleteError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : '無法解析訊息';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

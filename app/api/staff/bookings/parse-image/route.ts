import { NextResponse } from 'next/server';
import {
  buildBookingPreviewForStaffUi,
  mergeStaffUiBooking,
  resolveStoreSlugFromStaffName,
} from '@/lib/booking-message';
import { BookingParseIncompleteError, isGroqConfigured } from '@/lib/booking-message-ai';
import {
  assertBookingVisionConfigured,
  BOOKING_IMAGE_MIME_TYPES,
  parseBookingScreenshotWithAiEx,
  validateBookingImage,
  type BookingImageMimeType,
} from '@/lib/booking-message-vision-ai';
import { listActiveStaffForRoster } from '@/lib/staff-auth-server';
import { requireStaffSession } from '@/lib/portal-api';

export async function POST(request: Request) {
  const session = await requireStaffSession();
  if (session instanceof NextResponse) return session;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: '無法讀取上傳資料' }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '請上傳截圖' }, { status: 400 });
  }

  const mimeType = file.type;
  if (!(BOOKING_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return NextResponse.json(
      { error: '僅支援 JPG、PNG、WebP 截圖' },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!validateBookingImage(bytes, mimeType)) {
    return NextResponse.json({ error: '圖片過大或格式無效（上限 5MB）' }, { status: 400 });
  }

  const staffName = String(form.get('staffName') ?? '');
  const staffNoteRaw = form.get('staffNote');
  const staffNote =
    typeof staffNoteRaw === 'string' && staffNoteRaw.trim() ? staffNoteRaw.trim() : undefined;

  try {
    assertBookingVisionConfigured();
    const result = await parseBookingScreenshotWithAiEx(
      bytes,
      mimeType as BookingImageMimeType,
    );
    if (result.status === 'incomplete') {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    const roster = await listActiveStaffForRoster();
    const storeSlug = resolveStoreSlugFromStaffName(staffName, roster);
    const draft = mergeStaffUiBooking(result.data, {
      staffName,
      staffNote,
      storeSlug,
    });
    const preview = buildBookingPreviewForStaffUi(draft);

    return NextResponse.json({
      preview,
      parsedBy: 'ai-image',
      normalizedText: result.normalizedText,
      aiProvider: isGroqConfigured() ? 'groq-vision' : 'gemini-vision',
    });
  } catch (e) {
    if (e instanceof BookingParseIncompleteError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : '無法解析截圖';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

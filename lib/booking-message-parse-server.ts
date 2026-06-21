import { parseBookingMessage, type BookingMessageData, type StaffUiParsedBooking } from '@/lib/booking-message';
import {
  assertBookingAiConfigured,
  BookingParseIncompleteError,
  parseBookingMessageWithAiEx,
} from '@/lib/booking-message-ai';
import { listActiveStaffForRoster, type StaffRosterEntry } from '@/lib/staff-auth-server';

export type BookingParseMethod = 'rules' | 'ai';

export interface BookingParseResult {
  data: BookingMessageData;
  method: BookingParseMethod;
}

export async function parseBookingMessageWithFallback(
  text: string,
): Promise<BookingParseResult> {
  try {
    return { data: parseBookingMessage(text), method: 'rules' };
  } catch {
    throw new BookingParseIncompleteError(
      '無法解析此訊息，請補齊店名、姓名、電話、時長、時間',
    );
  }
}

export interface StaffPreviewParseResult {
  data: StaffUiParsedBooking;
  method: BookingParseMethod;
}

/** 師傅「預覽解析」：一律走 AI（Groq 優先，不套用舊規則格式） */
export async function parseBookingForStaffPreview(
  text: string,
  options?: { roster?: StaffRosterEntry[] },
): Promise<StaffPreviewParseResult> {
  assertBookingAiConfigured();
  const roster = options?.roster ?? (await listActiveStaffForRoster());
  const result = await parseBookingMessageWithAiEx(text, roster);
  if (result.status === 'incomplete') {
    throw new BookingParseIncompleteError(result.message);
  }
  return { data: result.data, method: 'ai' };
}

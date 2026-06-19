import { parseBookingMessage, type BookingMessageData } from '@/lib/booking-message';
import {
  BookingParseIncompleteError,
  isGeminiConfigured,
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
  options?: { roster?: StaffRosterEntry[] },
): Promise<BookingParseResult> {
  try {
    return { data: parseBookingMessage(text), method: 'rules' };
  } catch {
    if (!isGeminiConfigured()) {
      throw new BookingParseIncompleteError('無法解析此訊息，請補齊店名、姓名、電話、師傅、時長、時間');
    }
    const roster = options?.roster ?? (await listActiveStaffForRoster());
    const result = await parseBookingMessageWithAiEx(text, roster);
    if (result.status === 'incomplete') {
      throw new BookingParseIncompleteError(result.message);
    }
    return { data: result.data, method: 'ai' };
  }
}

/** 師傅「預覽解析」：一律走 AI（不套用舊規則格式） */
export async function parseBookingForStaffPreview(
  text: string,
  options?: { roster?: StaffRosterEntry[] },
): Promise<BookingParseResult> {
  if (!isGeminiConfigured()) {
    throw new BookingParseIncompleteError(
      'AI 解析尚未啟用，請在 Vercel 或 .env.local 設定 GEMINI_API_KEY',
    );
  }
  const roster = options?.roster ?? (await listActiveStaffForRoster());
  const result = await parseBookingMessageWithAiEx(text, roster);
  if (result.status === 'incomplete') {
    throw new BookingParseIncompleteError(result.message);
  }
  return { data: result.data, method: 'ai' };
}

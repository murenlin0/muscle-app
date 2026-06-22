import { parseRelativeDayDateTime } from '@/lib/booking-message-flex';
import { parseStoreDateTime, STORE_TIMEZONE } from '@/lib/store-timezone';

/** 移除 LINE 訊息傳送時間，避免誤當預約時間 */
export function sanitizeOcrChatForBookingParse(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';

      if (/^(?:已讀\s*)?\d{1,2}:\d{2}$/.test(trimmed)) return '';
      if (/^已讀(?:\s+\d{1,2}:\d{2})?$/.test(trimmed)) return '';
      if (/^今天$/.test(trimmed)) return '';

      if (/^\[(?:官方|客人)\]/.test(trimmed)) {
        return trimmed.replace(/\s+(?:已讀\s*)?\d{1,2}:\d{2}\s*$/, '').trim();
      }

      return trimmed;
    })
    .filter(Boolean)
    .join('\n');
}

function formatTaipeiHm(at: Date): string {
  return at.toLocaleString('en-GB', {
    timeZone: STORE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 此時間是否為 OCR 中某行末尾的「訊息傳送時間」 */
export function isLikelyMessageSendTimestamp(ocrText: string, at: Date): boolean {
  const hm = formatTaipeiHm(at);
  const hmEsc = hm.replace(':', '\\:');

  for (const line of ocrText.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.includes(hm)) continue;

    if (/\d{1,2}:\d{2}的預約/.test(trimmed)) {
      const appt = trimmed.match(/(\d{1,2}:\d{2})的預約/);
      if (appt?.[1] === hm) return false;
    }
    if (/時間[：:]/.test(trimmed) && trimmed.includes(hm)) {
      return false;
    }

    if (new RegExp(`(?:已讀\\s*)?${hmEsc}\\s*$`).test(trimmed)) {
      return true;
    }
  }

  return false;
}

export function hasStrongAppointmentTimeSignal(text: string): boolean {
  const sanitized = sanitizeOcrChatForBookingParse(text);
  return (
    /時間[：:]\s*\d{4}[-/]\d{1,2}/.test(sanitized) ||
    /\d{1,2}:\d{2}的預約/.test(sanitized) ||
    /(?:今天|明日|明天|後天|后天)[^\n]{0,80}\d{1,2}:\d{2}/.test(sanitized)
  );
}

function parseLabeledDateTime(
  y: string,
  mo: string,
  d: string,
  h: string,
  mi: string,
): Date {
  return parseStoreDateTime(Number(y), Number(mo), Number(d), Number(h), Number(mi));
}

const LABELED_TIME_RE =
  /時間[：:]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/g;

function extractAllLabeledTimes(sanitized: string): Date[] {
  const times: Date[] = [];
  for (const m of sanitized.matchAll(LABELED_TIME_RE)) {
    times.push(
      parseLabeledDateTime(m[1]!, m[2]!, m[3]!, m[4]!, m[5]!),
    );
  }
  return times;
}

/** 「預約成功」前最後一張確認卡的時間 */
function extractTimeBeforeBookingSuccess(sanitized: string): Date | null {
  const idx = sanitized.lastIndexOf('預約成功');
  if (idx < 0) return null;
  const times = extractAllLabeledTimes(sanitized.slice(0, idx));
  return times.length ? times[times.length - 1]! : null;
}

/** 最後一張【筋棧預約確認】卡片的時間 */
function extractTimeFromLastConfirmationCard(sanitized: string): Date | null {
  const parts = sanitized.split(/【筋棧預約確認】/);
  if (parts.length < 2) return null;
  const lastBlock = parts[parts.length - 1]!;
  const m = lastBlock.match(
    /時間[：:]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (!m) return null;
  return parseLabeledDateTime(m[1]!, m[2]!, m[3]!, m[4]!, m[5]!);
}

export function hasMultipleConfirmationTimes(text: string): boolean {
  const sanitized = sanitizeOcrChatForBookingParse(text);
  return extractAllLabeledTimes(sanitized).length > 1;
}

/** 從 OCR 擷取預約時間（忽略訊息傳送時間；多張確認卡取最後成功那張） */
export function extractAppointmentTimeFromOcr(text: string, ref = new Date()): Date | null {
  const sanitized = sanitizeOcrChatForBookingParse(text);
  if (!sanitized) return null;

  const fromSuccess = extractTimeBeforeBookingSuccess(sanitized);
  if (fromSuccess) return fromSuccess;

  const fromLastCard = extractTimeFromLastConfirmationCard(sanitized);
  if (fromLastCard) return fromLastCard;

  const allLabeled = extractAllLabeledTimes(sanitized);
  if (allLabeled.length) return allLabeled[allLabeled.length - 1]!;

  const apptClock = sanitized.match(/(\d{1,2}):(\d{2})的預約/);
  if (apptClock) {
    const hour = Number(apptClock[1]);
    const minute = Number(apptClock[2]);
    const { year, month, day } = taipeiYmd(ref);
    const dayOffset = /(?:明天|明日)/.test(sanitized)
      ? 1
      : /(?:後天|后天)/.test(sanitized)
        ? 2
        : 0;
    const base = parseStoreDateTime(year, month, day, 12, 0);
    const shifted = new Date(base.getTime() + dayOffset * 86_400_000);
    const ymd = taipeiYmd(shifted);
    return parseStoreDateTime(ymd.year, ymd.month, ymd.day, hour, minute);
  }

  const relative = parseRelativeDayDateTime(sanitized, ref);
  if (relative) return relative;

  const iso = sanitized.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (iso) {
    return parseStoreDateTime(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      Number(iso[4]),
      Number(iso[5]),
    );
  }

  const md = sanitized.match(
    /(?:^|[^\d])(\d{1,2})[\/\-月](\d{1,2})[日]?\s+(\d{1,2}):(\d{2})/m,
  );
  if (md) {
    const { year } = taipeiYmd(ref);
    return parseStoreDateTime(
      year,
      Number(md[1]),
      Number(md[2]),
      Number(md[3]),
      Number(md[4]),
    );
  }

  return null;
}

function taipeiYmd(ref: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

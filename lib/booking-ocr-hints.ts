import { normalizePhone, stripAllSpaces, stripVipPrefix } from '@/lib/phone';
import {
  buildStaffMessageCore,
  parseRelativeDayDateTime,
  type FlexibleBookingFields,
} from '@/lib/booking-message-flex';
import type { AiBookingParseResult } from '@/lib/booking-message-ai';
import type { StaffUiParsedBooking } from '@/lib/booking-message';
import { parseStoreDateTime, STORE_TIMEZONE } from '@/lib/store-timezone';

/** OCR 常見混淆字元 → 數字 */
function ocrDigitFix(raw: string): string {
  return raw
    .replace(/[OoＯｏQ]/g, '0')
    .replace(/[Il|Ｉｉ|]/g, '1')
    .replace(/[Ｚｚ]/g, '2')
    .replace(/[Ｂｂ]/g, '8')
    .replace(/[Ｓｓ]/g, '5');
}

function extractPhoneFromOcr(text: string): string | null {
  const fixed = ocrDigitFix(text);
  const labeled = fixed.match(/電話[：:]\s*([0-9O\s\-－—]{10,14})/i);
  if (labeled) {
    const p = normalizePhone(labeled[1]!);
    if (p) return p;
  }
  for (const m of fixed.matchAll(/(?:^|[^\d])((?:0?9[\dO\s\-－—]{8,12}))(?:[^\d]|$)/g)) {
    const p = normalizePhone(m[1]!);
    if (p) return p;
  }
  return null;
}

function extractNameFromOcr(text: string): string | null {
  const labeled = text.match(/姓名[：:]\s*([^\n\r\d，,。、]{2,12})/);
  if (labeled) {
    const name = stripVipPrefix(stripAllSpaces(labeled[1]!)).trim();
    if (name.length >= 2) return name;
  }
  const beforePhone = text.match(
    /(?:VIP)?([\u4e00-\u9fffA-Za-z]{2,8})\s*(?:0?9[\dO\s\-－—]{8,12})/,
  );
  if (beforePhone) {
    const name = stripVipPrefix(stripAllSpaces(beforePhone[1]!)).trim();
    if (name.length >= 2 && !/官方|客人|師傅|筋棧|運動|按摩|預約/.test(name)) return name;
  }
  return null;
}

function extractDurationFromOcr(text: string): number | null {
  const labeled = text.match(/(?:項目|時長|服務)[：:][^\n]*?(\d{2,3})\s*(?:分|min|分鐘)/i);
  const compact = text.match(/(\d{2,3})分鐘/);
  const m = labeled ?? compact ?? text.match(/(?:運動按摩\s*)?(\d{2,3})\s*(?:分|min|分鐘)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return [30, 60, 90, 120].includes(n) ? n : null;
}

function taipeiNowParts(ref = new Date()): { year: number; month: number; day: number } {
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

function extractTimeFromOcr(text: string): Date | null {
  const labeled = text.match(
    /時間[：:]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/,
  );
  if (labeled) {
    return parseStoreDateTime(
      Number(labeled[1]),
      Number(labeled[2]),
      Number(labeled[3]),
      Number(labeled[4]),
      Number(labeled[5]),
    );
  }
  const iso = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (iso) {
    return parseStoreDateTime(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      Number(iso[4]),
      Number(iso[5]),
    );
  }
  const md = text.match(/(?:^|[^\d])(\d{1,2})[\/\-月](\d{1,2})[日]?\s+(\d{1,2}):(\d{2})/m);
  if (md) {
    const { year } = taipeiNowParts();
    return parseStoreDateTime(year, Number(md[1]), Number(md[2]), Number(md[3]), Number(md[4]));
  }
  const relative = parseRelativeDayDateTime(text);
  if (relative) return relative;
  return null;
}

export function extractBookingHintsFromOcrText(text: string): FlexibleBookingFields {
  const durationMinutes = extractDurationFromOcr(text);
  return {
    storeLabel: null,
    storeSlug: null,
    clientName: extractNameFromOcr(text),
    phone: extractPhoneFromOcr(text),
    durationMinutes,
    serviceLabel: durationMinutes ? `運動按摩 ${durationMinutes}min` : null,
    startsAt: extractTimeFromOcr(text),
    staffName: null,
    note: null,
  };
}

function parsedToFields(data: StaffUiParsedBooking): FlexibleBookingFields {
  return {
    storeLabel: null,
    storeSlug: null,
    clientName: data.clientName,
    phone: data.phone,
    durationMinutes: data.durationMinutes,
    serviceLabel: data.serviceLabel,
    startsAt: data.startsAt,
    staffName: null,
    note: data.note,
  };
}

function missingFieldsMessage(fields: FlexibleBookingFields): string {
  const missing: string[] = [];
  if (!fields.clientName?.trim()) missing.push('姓名');
  if (!fields.phone) missing.push('電話');
  if (!fields.durationMinutes) missing.push('時長');
  if (!fields.startsAt) missing.push('預約時間');
  return missing.length ? `缺少${missing.join('、')}` : '無法解析此訊息';
}

/** OCR 文字 regex 補齊 AI 未抓到的欄位 */
export function tryCompleteBookingFromOcrText(
  parsed: AiBookingParseResult,
  ocrText: string,
): AiBookingParseResult {
  const hints = extractBookingHintsFromOcrText(ocrText);
  const base =
    parsed.status === 'complete'
      ? parsedToFields(parsed.data)
      : {
          storeLabel: null,
          storeSlug: null,
          clientName: null,
          phone: null,
          durationMinutes: null,
          serviceLabel: null,
          startsAt: null,
          staffName: null,
          note: null,
        };

  const merged: FlexibleBookingFields = {
    ...base,
    clientName: base.clientName ?? hints.clientName,
    phone: base.phone ?? hints.phone,
    durationMinutes: base.durationMinutes ?? hints.durationMinutes,
    serviceLabel:
      base.serviceLabel ??
      hints.serviceLabel ??
      (hints.durationMinutes ? `運動按摩 ${hints.durationMinutes}min` : null),
    startsAt: base.startsAt ?? hints.startsAt,
  };

  try {
    return { status: 'complete', data: buildStaffMessageCore(merged) };
  } catch {
    if (parsed.status === 'incomplete') return parsed;
    return { status: 'incomplete', message: missingFieldsMessage(merged) };
  }
}

import { normalizePhone, stripAllSpaces, stripVipPrefix } from '@/lib/phone';
import {
  extractAppointmentTimeFromOcr,
  hasStrongAppointmentTimeSignal,
  isLikelyMessageSendTimestamp,
} from '@/lib/booking-ocr-sanitize';
import {
  buildStaffMessageCore,
  type FlexibleBookingFields,
} from '@/lib/booking-message-flex';
import type { AiBookingParseResult } from '@/lib/booking-message-ai';
import type { StaffUiParsedBooking } from '@/lib/booking-message';

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

function extractTimeFromOcr(text: string): Date | null {
  return extractAppointmentTimeFromOcr(text);
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

/** 僅用 OCR regex 嘗試解析（不呼叫 AI，省配額） */
export function tryParseBookingFromOcrTextOnly(ocrText: string): AiBookingParseResult {
  return tryCompleteBookingFromOcrText({ status: 'incomplete', message: '' }, ocrText);
}

function pickStartsAt(ocrText: string, aiTime: Date | null, hintTime: Date | null): Date | null {
  let resolved = aiTime;
  if (resolved && isLikelyMessageSendTimestamp(ocrText, resolved)) {
    resolved = null;
  }
  if (hintTime && hasStrongAppointmentTimeSignal(ocrText)) {
    return hintTime;
  }
  return resolved ?? hintTime;
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
    startsAt: pickStartsAt(ocrText, base.startsAt, hints.startsAt),
  };

  try {
    return { status: 'complete', data: buildStaffMessageCore(merged) };
  } catch {
    return { status: 'incomplete', message: missingFieldsMessage(merged) };
  }
}

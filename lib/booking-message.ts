import { normalizePhone, stripAllSpaces } from '@/lib/phone';
import {
  buildFromFlexibleFields,
  extractFlexibleBookingFields,
  normalizeBookingText,
  parseFlexibleDateTime,
  validateRequiredBookingFields,
} from '@/lib/booking-message-flex';
import { parseStoreDateTime } from '@/lib/store-timezone';
import {
  getStore,
  resolveStoreSlugFromMessageLabel,
  type StoreSlug,
} from '@/lib/stores';

export interface BookingMessageData {
  storeSlug: StoreSlug;
  storeLabel: string;
  /** 師傅端建立日曆用；客人 LIFF 訊息不含此欄 */
  staffName?: string | null;
  clientName: string;
  phone: string;
  serviceLabel: string;
  durationMinutes: number;
  startsAt: Date;
  note: string | null;
}

export interface BookingMessagePreview extends BookingMessageData {
  endsAt: Date;
  calendarTitle: string;
}

const FIELD_PATTERNS: Record<string, RegExp> = {
  store: /^筋棧.+店$/,
  staff: /^師傅[：:]/,
  name: /^姓名[：:]?/,
  phone: /^電話[：:]?/,
  service: /^項目[：:]?/,
  time: /^時間[：:]?/,
  note: /^備註[：:]/,
};

function parseFieldValue(line: string): string {
  const idx = line.search(/[：:]/);
  return idx >= 0 ? line.slice(idx + 1).trim() : line.trim();
}

function parseDurationMinutes(serviceLine: string): number {
  const match = serviceLine.match(/(30|60|90|120)\s*(?:min|minutes|分鐘|分钟|分)\b/i);
  if (!match) throw new Error('項目須包含時長，例如：運動按摩 60min');
  return Number(match[1]);
}

function normalizeTimeFieldValue(raw: string): string {
  return raw.replace('T', ' ').replace(/：/g, ':').trim();
}

function parseStartsAt(timeLine: string): Date {
  const raw = normalizeTimeFieldValue(
    timeLine.includes('時間') ? parseFieldValue(timeLine) : timeLine,
  );
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, y, mo, d, h, mi] = match;
    return parseStoreDateTime(Number(y), Number(mo), Number(d), Number(h), Number(mi));
  }

  const flexible = parseFlexibleDateTime(raw);
  if (flexible) return flexible;

  throw new Error('時間格式須為 YYYY-MM-DD HH:mm，例如：2026-06-15 14:00');
}

function parseStructuredBookingMessage(text: string): BookingMessageData {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length || !lines[0].includes('筋棧預約確認')) {
    throw new Error('訊息須以【筋棧預約確認】開頭');
  }

  const data: Partial<BookingMessageData> & { note?: string | null } = {
    note: null,
  };

  let storeLine: string | null = null;

  for (const line of lines.slice(1)) {
    if (FIELD_PATTERNS.store.test(line)) {
      storeLine = line.trim();
      continue;
    }
    if (FIELD_PATTERNS.staff.test(line)) {
      data.staffName = parseFieldValue(line);
      continue;
    }
    if (FIELD_PATTERNS.name.test(line)) {
      data.clientName = stripAllSpaces(line.replace(/^姓名[：:\s]*/, ''));
      continue;
    }
    if (FIELD_PATTERNS.phone.test(line)) {
      const phone = normalizePhone(line.replace(/^電話[：:\s]*/, ''));
      if (!phone) throw new Error('電話須為 09 開頭 10 碼');
      data.phone = phone;
      continue;
    }
    if (FIELD_PATTERNS.service.test(line)) {
      const serviceLabel = line.replace(/^項目[：:\s]*/, '').trim();
      data.serviceLabel = serviceLabel;
      data.durationMinutes = parseDurationMinutes(serviceLabel);
      continue;
    }
    if (FIELD_PATTERNS.time.test(line)) {
      data.startsAt = parseStartsAt(line.replace(/^時間[：:\s]*/, '時間: '));
      continue;
    }
    if (FIELD_PATTERNS.note.test(line)) {
      data.note = parseFieldValue(line) || null;
    }
  }

  const flexFields = extractFlexibleBookingFields(text);
  if (!data.startsAt && flexFields.startsAt) data.startsAt = flexFields.startsAt;
  if (!data.durationMinutes && flexFields.durationMinutes) {
    data.durationMinutes = flexFields.durationMinutes;
    data.serviceLabel = flexFields.serviceLabel ?? undefined;
  }
  if (!data.clientName && flexFields.clientName) data.clientName = flexFields.clientName;
  if (!data.phone && flexFields.phone) data.phone = flexFields.phone;

  if (!storeLine) {
    if (flexFields.storeLabel) storeLine = flexFields.storeLabel;
    else throw new Error('缺少店名（例如：筋棧民有店）');
  }
  const storeSlug = resolveStoreSlugFromMessageLabel(storeLine);
  if (!storeSlug) throw new Error(`無法辨識店名：${storeLine}`);

  validateRequiredBookingFields({
    storeLabel: storeLine,
    storeSlug,
    clientName: data.clientName ?? null,
    phone: data.phone ?? null,
    durationMinutes: data.durationMinutes ?? null,
    serviceLabel: data.serviceLabel ?? null,
    startsAt: data.startsAt ?? null,
    staffName: data.staffName ?? null,
    note: data.note ?? null,
  });

  if (!data.serviceLabel || !data.durationMinutes) throw new Error('缺少項目');

  const store = getStore(storeSlug);
  return {
    storeSlug,
    storeLabel: store?.messageStoreLabel ?? storeLine,
    staffName: data.staffName?.trim() || null,
    clientName: data.clientName!.trim(),
    phone: data.phone!,
    serviceLabel: data.serviceLabel,
    durationMinutes: data.durationMinutes!,
    startsAt: data.startsAt!,
    note: data.note ?? null,
  };
}

export function parseBookingMessage(text: string): BookingMessageData {
  const normalized = normalizeBookingText(text);
  const flexible = extractFlexibleBookingFields(normalized);

  try {
    if (normalized.includes('筋棧預約確認')) {
      return parseStructuredBookingMessage(normalized);
    }
  } catch {
    // 結構化格式不完整時改走彈性解析
  }

  return buildFromFlexibleFields(flexible);
}

export const UNASSIGNED_STAFF_LABEL = '未指定';

/** 師傅 UI：補上負責師傅與師傅備註後再建日曆（UI 未指定時沿用訊息／AI 解析的師傅） */
export function finalizeStaffBooking(
  parsed: BookingMessageData,
  input: { staffName?: string; staffNote?: string | null },
): BookingMessageData {
  const uiStaff = input.staffName?.trim() ?? '';
  const parsedStaff = parsed.staffName?.trim() ?? '';
  const staffName =
    uiStaff && uiStaff !== UNASSIGNED_STAFF_LABEL ? uiStaff : parsedStaff;

  if (!staffName || staffName === UNASSIGNED_STAFF_LABEL) {
    throw new Error('沒有輸入師傅名稱');
  }

  const noteParts = [parsed.note?.trim(), input.staffNote?.trim()].filter(Boolean);
  return {
    ...parsed,
    staffName,
    note: noteParts.length ? noteParts.join('；') : null,
  };
}

export function buildCalendarTitle(input: {
  staffName: string;
  durationMinutes: number;
  clientName: string;
  phone: string;
}): string {
  return `${input.staffName}${input.durationMinutes}分${input.clientName}${input.phone}`;
}

/** 從日曆標題解析師傅前綴，例如「仁120分2100…」→「仁」 */
export function parseStaffPrefixFromCalendarTitle(title: string): string | null {
  const t = stripAllSpaces(title);
  const head = t.match(/^(.+?\d+分)/)?.[1];
  if (!head) return null;
  const prefix = head.replace(/\d+分$/, '');
  return prefix || null;
}

export function buildBookingPreview(data: BookingMessageData): BookingMessagePreview {
  if (!data.staffName?.trim()) {
    throw new Error('缺少負責師傅');
  }
  const endsAt = new Date(data.startsAt.getTime() + data.durationMinutes * 60_000);
  return {
    ...data,
    staffName: data.staffName.trim(),
    endsAt,
    calendarTitle: buildCalendarTitle({
      staffName: data.staffName.trim(),
      durationMinutes: data.durationMinutes,
      clientName: data.clientName,
      phone: data.phone,
    }),
  };
}

export function formatBookingMessage(data: BookingMessageData): string {
  const store = getStore(data.storeSlug);
  const lines = [
    '【筋棧預約確認】',
    store?.messageStoreLabel ?? data.storeLabel,
    `姓名：${data.clientName}`,
    `電話：${data.phone}`,
    `項目：${data.serviceLabel}`,
    `時間：${formatLocalDateTime(data.startsAt)}`,
  ];
  if (data.note?.trim()) lines.push(`備註：${data.note.trim()}`);
  return lines.join('\n');
}

function formatLocalDateTime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

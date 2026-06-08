import { normalizePhone, stripAllSpaces } from '@/lib/phone';
import {
  getStore,
  resolveStoreSlugFromMessageLabel,
  type StoreSlug,
} from '@/lib/stores';

export interface BookingMessageData {
  storeSlug: StoreSlug;
  storeLabel: string;
  staffName: string;
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
  name: /^姓名[：:]/,
  phone: /^電話[：:]/,
  service: /^項目[：:]/,
  time: /^時間[：:]/,
  note: /^備註[：:]/,
};

function parseFieldValue(line: string): string {
  const idx = line.search(/[：:]/);
  return idx >= 0 ? line.slice(idx + 1).trim() : line.trim();
}

function parseDurationMinutes(serviceLine: string): number {
  const match = serviceLine.match(/(\d+)\s*min/i);
  if (!match) throw new Error('項目須包含時長，例如：運動按摩 60min');
  return Number(match[1]);
}

function parseStartsAt(timeLine: string): Date {
  const raw = parseFieldValue(timeLine).replace('T', ' ');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error('時間格式須為 YYYY-MM-DD HH:mm，例如：2026-06-15 14:00');
  }
  const [, y, mo, d, h, mi] = match;
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    0,
    0,
  );
  if (Number.isNaN(date.getTime())) throw new Error('無效的預約時間');
  return date;
}

export function parseBookingMessage(text: string): BookingMessageData {
  const lines = text
    .split(/\r?\n/)
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
      data.clientName = stripAllSpaces(parseFieldValue(line));
      continue;
    }
    if (FIELD_PATTERNS.phone.test(line)) {
      const phone = normalizePhone(parseFieldValue(line));
      if (!phone) throw new Error('電話須為 09 開頭 10 碼');
      data.phone = phone;
      continue;
    }
    if (FIELD_PATTERNS.service.test(line)) {
      const serviceLabel = parseFieldValue(line);
      data.serviceLabel = serviceLabel;
      data.durationMinutes = parseDurationMinutes(serviceLabel);
      continue;
    }
    if (FIELD_PATTERNS.time.test(line)) {
      data.startsAt = parseStartsAt(line);
      continue;
    }
    if (FIELD_PATTERNS.note.test(line)) {
      data.note = parseFieldValue(line) || null;
    }
  }

  if (!storeLine) throw new Error('缺少店名行（例如：筋棧民有店）');
  const storeSlug = resolveStoreSlugFromMessageLabel(storeLine);
  if (!storeSlug) throw new Error(`無法辨識店名：${storeLine}`);

  if (!data.staffName?.trim()) throw new Error('缺少師傅');
  if (!data.clientName?.trim()) throw new Error('缺少姓名');
  if (!data.phone) throw new Error('缺少或無效電話');
  if (!data.serviceLabel || !data.durationMinutes) throw new Error('缺少項目');
  if (!data.startsAt) throw new Error('缺少時間');

  const store = getStore(storeSlug);
  return {
    storeSlug,
    storeLabel: store?.messageStoreLabel ?? storeLine,
    staffName: data.staffName.trim(),
    clientName: data.clientName.trim(),
    phone: data.phone,
    serviceLabel: data.serviceLabel,
    durationMinutes: data.durationMinutes,
    startsAt: data.startsAt,
    note: data.note ?? null,
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

export function buildBookingPreview(data: BookingMessageData): BookingMessagePreview {
  const endsAt = new Date(data.startsAt.getTime() + data.durationMinutes * 60_000);
  return {
    ...data,
    endsAt,
    calendarTitle: buildCalendarTitle({
      staffName: data.staffName,
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
    `師傅：${data.staffName}`,
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

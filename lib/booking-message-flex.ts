import { normalizePhone, stripAllSpaces } from '@/lib/phone';
import { parseStoreDateTime, STORE_TIMEZONE } from '@/lib/store-timezone';
import {
  resolveStoreSlugFromMessageLabel,
  STORE_LIST,
  type StoreSlug,
} from '@/lib/stores';

export interface FlexibleBookingFields {
  storeLabel: string | null;
  storeSlug: StoreSlug | null;
  clientName: string | null;
  phone: string | null;
  durationMinutes: number | null;
  serviceLabel: string | null;
  startsAt: Date | null;
  staffName: string | null;
  note: string | null;
}

const DURATION_MINUTES = [30, 60, 90, 120] as const;

const CN_DIGIT: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function parseChineseNumber(raw: string): number | null {
  const s = raw.trim();
  if (/^\d+$/.test(s)) return Number(s);

  if (s === '十') return 10;
  if (s.startsWith('十') && s.length === 2 && CN_DIGIT[s[1]!] != null) {
    return 10 + CN_DIGIT[s[1]!]!;
  }
  if (s.endsWith('十') && s.length === 2 && CN_DIGIT[s[0]!] != null) {
    return CN_DIGIT[s[0]!]! * 10;
  }
  if (s.length === 3 && s[1] === '十') {
    const tens = CN_DIGIT[s[0]!];
    const ones = CN_DIGIT[s[2]!];
    if (tens != null && ones != null) return tens * 10 + ones;
  }
  if (CN_DIGIT[s] != null) return CN_DIGIT[s]!;

  return null;
}

export function normalizeBookingText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[：﹕]/g, ':')
    .replace(/[／⁄]/g, '/')
    .replace(/[－—–]/g, '-')
    .trim();
}

function taipeiDateParts(ref = new Date()): { year: number; month: number; day: number } {
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

function inferYear(month: number, day: number, ref = new Date()): number {
  const { year } = taipeiDateParts(ref);
  const candidate = parseStoreDateTime(year, month, day, 12, 0);
  const cutoff = ref.getTime() - 30 * 86_400_000;
  if (candidate.getTime() < cutoff) return year + 1;
  return year;
}

function applyDayPeriod(
  hour: number,
  period: string | null | undefined,
): number {
  if (!period) return hour;
  if (/中午/.test(period)) return hour <= 11 ? 12 : hour;
  if (/下午|晚上|傍晚|午後/.test(period)) return hour < 12 ? hour + 12 : hour;
  if (/凌晨|早上|上午|清晨|早/.test(period)) {
    if (hour === 12) return 0;
    return hour;
  }
  return hour;
}

function parseClockFragment(raw: string): { hour: number; minute: number } | null {
  const s = raw.replace(/\s+/g, '');

  const plain = s.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) {
    const hour = Number(plain[1]);
    const minute = Number(plain[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }

  const cn = s.match(
    /^(凌晨|早上|上午|清晨|中午|下午|晚上|傍晚|午後)?(\d{1,2}|[一二三四五六七八九十兩]+)(?:點|时|時)(半|(\d{1,2})分?)?$/,
  );
  if (cn) {
    const hourRaw = parseChineseNumber(cn[2]!);
    if (hourRaw == null || hourRaw < 0 || hourRaw > 23) return null;
    let minute = 0;
    if (cn[3] === '半') minute = 30;
    else if (cn[4]) minute = Number(cn[4]);
    let hour = applyDayPeriod(hourRaw, cn[1]);
    if (!cn[1] && hour >= 1 && hour <= 6) hour += 12;
    return { hour, minute };
  }

  const periodClock = s.match(
    /^(凌晨|早上|上午|清晨|中午|下午|晚上|傍晚|午後)?(\d{1,2}):(\d{2})$/,
  );
  if (periodClock) {
    const hour = applyDayPeriod(Number(periodClock[2]), periodClock[1]);
    const minute = Number(periodClock[3]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }

  return null;
}

function extractClockFromSegment(segment: string): { hour: number; minute: number } | null {
  const compact = stripAllSpaces(segment);

  const labeled = segment.match(/(?:時間|預約|時段)[:\s]*(.+)$/i);
  if (labeled) {
    const fromLabel = parseClockFragment(stripAllSpaces(labeled[1]!));
    if (fromLabel) return fromLabel;
  }

  const direct = parseClockFragment(compact);
  if (direct) return direct;

  const embedded = compact.match(
    /(凌晨|早上|上午|清晨|中午|下午|晚上|傍晚|午後)?(\d{1,2}|[一二三四五六七八九十兩]+)(?:點|时|時)(?:半|\d{1,2}分?)?/,
  );
  if (embedded) {
    const parsed = parseClockFragment(embedded[0]!);
    if (parsed) return parsed;
  }

  const plain = compact.match(/(\d{1,2}:\d{2})/);
  if (plain) return parseClockFragment(plain[1]!);

  return null;
}

export function parseFlexibleDateTime(text: string, ref = new Date()): Date | null {
  const normalized = normalizeBookingText(text);

  const iso = normalized.match(
    /(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]|[^\d]{0,3})(\d{1,2}:\d{2})/,
  );
  if (iso) {
    const clock = parseClockFragment(iso[4]!);
    if (clock) {
      return parseStoreDateTime(
        Number(iso[1]),
        Number(iso[2]),
        Number(iso[3]),
        clock.hour,
        clock.minute,
      );
    }
  }

  const zhDate = normalized.match(
    /(\d{1,2})月(\d{1,2})日(?:[\s,，、]*)?((?:凌晨|早上|上午|清晨|中午|下午|晚上|傍晚|午後)?(?:\d{1,2}:\d{2}|\d{1,2}|[一二三四五六七八九十兩]+)(?:點|时|時)?(?:半|\d{1,2}分?)?)/,
  );
  if (zhDate) {
    const month = Number(zhDate[1]);
    const day = Number(zhDate[2]);
    const clock = extractClockFromSegment(zhDate[3]!);
    if (clock) {
      const year = inferYear(month, day, ref);
      return parseStoreDateTime(year, month, day, clock.hour, clock.minute);
    }
  }

  const slashDate = normalized.match(
    /(?:^|[^\d])((?:\d{4}[-/])?\d{1,2}[-/]\d{1,2})(?:日)?(?:[\s,，、]*)?((?:凌晨|早上|上午|清晨|中午|下午|晚上|傍晚|午後)?(?:\d{1,2}:\d{2}|\d{1,2}|[一二三四五六七八九十兩]+)(?:點|时|時)?(?:半|\d{1,2}分?)?)/,
  );
  if (slashDate) {
    const datePart = slashDate[1]!;
    const clock = extractClockFromSegment(slashDate[2]!);
    if (clock) {
      const withYear = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (withYear) {
        return parseStoreDateTime(
          Number(withYear[1]),
          Number(withYear[2]),
          Number(withYear[3]),
          clock.hour,
          clock.minute,
        );
      }
      const short = datePart.match(/^(\d{1,2})[-/](\d{1,2})$/);
      if (short) {
        const month = Number(short[1]);
        const day = Number(short[2]);
        const year = inferYear(month, day, ref);
        return parseStoreDateTime(year, month, day, clock.hour, clock.minute);
      }
    }
  }

  const timeLine = normalized.match(/(?:^|\n)\s*時間[:\s]+(.+)$/m);
  if (timeLine) {
    const fromLine = parseFlexibleDateTime(timeLine[1]!, ref);
    if (fromLine) return fromLine;
    const clockOnly = extractClockFromSegment(timeLine[1]!);
    if (clockOnly) {
      const { year, month, day } = taipeiDateParts(ref);
      return parseStoreDateTime(year, month, day, clockOnly.hour, clockOnly.minute);
    }
  }

  return null;
}

function extractDurationMinutes(text: string): number | null {
  const normalized = normalizeBookingText(text);

  const labeled = normalized.match(/項目[:\s]+(.+)$/m);
  if (labeled) {
    const fromService = labeled[1]!.match(/(30|60|90|120)\s*(?:min|minutes|分鐘|分钟|分)\b/i);
    if (fromService) return Number(fromService[1]);
  }

  const matches = [
    ...normalized.matchAll(/(?:^|[^\d])(30|60|90|120)\s*(?:min|minutes|分鐘|分钟|分)\b/gi),
  ];
  if (matches.length) return Number(matches[0]![1]);

  const compact = normalized.match(/(?:^|[^\d])(30|60|90|120)(?:min|分鐘|分钟|分)(?:[^\d]|$)/i);
  if (compact) return Number(compact[1]);

  return null;
}

function extractServiceLabel(text: string, durationMinutes: number | null): string | null {
  const labeled = normalizeBookingText(text).match(/(?:^|\n)\s*項目[:\s]+(.+)$/m);
  if (labeled?.[1]?.trim()) return labeled[1].trim();
  if (durationMinutes) return `運動按摩 ${durationMinutes}min`;
  return null;
}

function extractPhone(text: string): string | null {
  const normalized = normalizeBookingText(text);
  const labeled = normalized.match(/(?:^|\n)\s*電話[:\s]+([^\n]+)/m);
  if (labeled) {
    const phone = normalizePhone(labeled[1]!);
    if (phone) return phone;
  }

  const matches = [...normalized.matchAll(/09\d{8}/g)];
  if (!matches.length) return null;
  return normalizePhone(matches[matches.length - 1]![0]);
}

function extractClientName(text: string, phone: string | null): string | null {
  const normalized = normalizeBookingText(text);
  const labeled = normalized.match(/姓名[:\s]*([\u4e00-\u9fffA-Za-z·]{2,12})/);
  if (labeled?.[1]?.trim()) {
    return stripAllSpaces(labeled[1].trim());
  }

  if (!phone) return null;

  const phoneIdx = normalized.lastIndexOf(phone);
  if (phoneIdx <= 0) return null;

  const before = normalized.slice(Math.max(0, phoneIdx - 16), phoneIdx);
  const nameMatch = before.match(/([\u4e00-\u9fffA-Za-z·]{2,12})[^\u4e00-\u9fffA-Za-z·]*$/);
  if (nameMatch?.[1]) {
    const name = stripAllSpaces(nameMatch[1]);
    if (name && !/電話|姓名|項目|時間|師傅|備註|筋棧|預約|min|分鐘|分钟/.test(name)) {
      return name;
    }
  }

  return null;
}

function extractStore(text: string): { storeLabel: string; storeSlug: StoreSlug } | null {
  const normalized = normalizeBookingText(text);
  for (const store of STORE_LIST) {
    if (normalized.includes(store.messageStoreLabel)) {
      return { storeLabel: store.messageStoreLabel, storeSlug: store.slug };
    }
  }

  const generic = normalized.match(/筋棧[\u4e00-\u9fff]{1,8}店/);
  if (generic) {
    const label = generic[0];
    const slug = resolveStoreSlugFromMessageLabel(label);
    if (slug) return { storeLabel: label, storeSlug: slug };
  }

  if (/民有/.test(normalized)) {
    const store = STORE_LIST.find((s) => s.slug === 'store1');
    if (store) return { storeLabel: store.messageStoreLabel, storeSlug: store.slug };
  }
  if (/文一/.test(normalized)) {
    const store = STORE_LIST.find((s) => s.slug === 'store2');
    if (store) return { storeLabel: store.messageStoreLabel, storeSlug: store.slug };
  }

  return null;
}

function extractStaffName(text: string): string | null {
  const match = normalizeBookingText(text).match(/(?:^|\n)\s*師傅[:\s]+([^\n]+)/m);
  return match?.[1]?.trim() || null;
}

function extractNote(text: string): string | null {
  const match = normalizeBookingText(text).match(/(?:^|\n)\s*備註[:\s]+([^\n]+)/m);
  return match?.[1]?.trim() || null;
}

export function extractFlexibleBookingFields(
  text: string,
  ref = new Date(),
): FlexibleBookingFields {
  const phone = extractPhone(text);
  const durationMinutes = extractDurationMinutes(text);
  const store = extractStore(text);

  return {
    storeLabel: store?.storeLabel ?? null,
    storeSlug: store?.storeSlug ?? null,
    clientName: extractClientName(text, phone),
    phone,
    durationMinutes,
    serviceLabel: extractServiceLabel(text, durationMinutes),
    startsAt: parseFlexibleDateTime(text, ref),
    staffName: extractStaffName(text),
    note: extractNote(text),
  };
}

export function buildFromFlexibleFields(
  fields: FlexibleBookingFields,
): {
  storeSlug: StoreSlug;
  storeLabel: string;
  clientName: string;
  phone: string;
  serviceLabel: string;
  durationMinutes: number;
  startsAt: Date;
  staffName: string | null;
  note: string | null;
} {
  if (!fields.storeSlug || !fields.storeLabel) {
    throw new Error('缺少店名（例如：筋棧民有店）');
  }
  if (!fields.clientName?.trim()) throw new Error('缺少姓名');
  if (!fields.phone) throw new Error('缺少或無效電話');
  if (!fields.durationMinutes) {
    throw new Error('缺少時長（請包含 30/60/90 分鐘或 min）');
  }
  if (!fields.startsAt) {
    throw new Error('缺少或無法辨識預約時間（例如：6/19 下午3:00、2026-06-19 15:00）');
  }
  if (!fields.serviceLabel) {
    throw new Error('缺少項目');
  }

  return {
    storeSlug: fields.storeSlug,
    storeLabel: fields.storeLabel,
    clientName: fields.clientName.trim(),
    phone: fields.phone,
    serviceLabel: fields.serviceLabel,
    durationMinutes: fields.durationMinutes,
    startsAt: fields.startsAt,
    staffName: fields.staffName?.trim() || null,
    note: fields.note ?? null,
  };
}

export function parseFlexibleBookingMessage(text: string, ref = new Date()) {
  return buildFromFlexibleFields(extractFlexibleBookingFields(text, ref));
}

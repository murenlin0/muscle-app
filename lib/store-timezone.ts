export const STORE_TIMEZONE = 'Asia/Taipei';

/** ISO 或 Date → 台北日期 YYYY-MM-DD */
export function formatStoreDateIso(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** YYYY-MM-DD ± days（台北牆鐘） */
export function shiftStoreDateIso(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T12:00:00+08:00`);
  base.setDate(base.getDate() + days);
  return formatStoreDateIso(base);
}

/** 將 YYYY-MM-DD HH:mm 視為店舖當地（台北）牆鐘時間 */
export function parseStoreDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const y = String(year).padStart(4, '0');
  const mo = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  const mi = String(minute).padStart(2, '0');
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error('無效的預約時間');
  return date;
}

/** Google Calendar API：dateTime 不含 Z，配合 timeZone 欄位 */
export function formatStoreDateTimeForGoogle(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

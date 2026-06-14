export const STORE_TIMEZONE = 'Asia/Taipei';

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

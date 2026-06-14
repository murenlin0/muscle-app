/** 可預約營業時段：上午 10:00 起，至凌晨 12:00（24:00）結束 */
export const BOOKING_OPEN_HOUR = 10;
export const BOOKING_CLOSE_HOUR = 24;
/** 當日預約：現在時間 + 緩衝後才可選 */
export const BOOKING_MIN_LEAD_MINUTES = 30;

export const BOOKING_HOURS_LABEL = '上午10:00 – 凌晨12:00';

export function bookingHourLabel(hour: number): string {
  if (hour < 12) return `上午${hour}時`;
  if (hour === 12) return '下午12時';
  if (hour === 24) return '凌晨12時';
  return `下午${hour - 12}時`;
}

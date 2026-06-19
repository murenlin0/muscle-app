import type { TransactionCategory } from '@/lib/transaction-category';

/** 僅此類型從標題分鐘數計算時數 */
export const SERVICE_HOURS_CATEGORIES = ['一般消費', '會員使用'] as const satisfies readonly TransactionCategory[];

/** 從標題解析服務分鐘數，例如「仁60分」「H90分」「N60分現金1100」→ 60 / 90 / 60；無分鐘則 null */
export function minutesFromTitle(title: string): number | null {
  const m = title.match(/(\d{2,3})\s*分/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 依標題分鐘數與類型計算時數（分鐘 ÷ 60）；不符合規則則 null */
export function computeServiceHours(title: string, category: string): number | null {
  if (!(SERVICE_HOURS_CATEGORIES as readonly string[]).includes(category)) {
    return null;
  }
  const mins = minutesFromTitle(title);
  if (mins == null) return null;
  return mins / 60;
}

/** 顯示：0.5、1、1.5（必要時一位小數） */
export function formatServiceHours(hours: number | null): string {
  if (hours == null) return '—';
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function serviceHoursEqual(a: number | null, b: number | null): boolean {
  if (a == null && (b == null || b === 0)) return true;
  if (b == null && (a == null || a === 0)) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.001;
}

export { serviceHoursEqual };

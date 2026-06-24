import type { TransactionCategory } from '@/lib/transaction-category';

/**
 * 同日多筆類型優先序（數字小＝事件較早）。
 * 降序（新→舊）：使用在上、儲值在下（-1000 在 +4000 上方）。
 * 升序（舊→新）：儲值在上、使用在下（+4000 在 -1000 上方）。
 */
const MEMBER_ROW_ORDER: Partial<Record<TransactionCategory, number>> = {
  會員儲值: 0,
  會員補差額: 1,
  會員使用: 2,
};

function ledgerDateKey(iso: string): string {
  const part = iso.includes('T') ? iso.split('T')[0]! : iso;
  return part.slice(0, 10);
}

function memberRowOrder(category: string): number {
  return MEMBER_ROW_ORDER[category as TransactionCategory] ?? 9;
}

export interface LedgerSortRow {
  occurredOn: string;
  category: string;
  id: string;
}

export function compareLedgerDisplayRows(
  a: LedgerSortRow,
  b: LedgerSortRow,
  dateDescending: boolean,
): number {
  const dateA = ledgerDateKey(a.occurredOn);
  const dateB = ledgerDateKey(b.occurredOn);
  if (dateA !== dateB) {
    return dateDescending
      ? dateB.localeCompare(dateA)
      : dateA.localeCompare(dateB);
  }

  const ca = memberRowOrder(a.category);
  const cb = memberRowOrder(b.category);
  if (ca !== cb) return dateDescending ? cb - ca : ca - cb;

  return dateDescending ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
}

export function sortLedgerDisplayRows<T extends LedgerSortRow>(
  rows: T[],
  dateDescending = true,
): T[] {
  return [...rows].sort((a, b) => compareLedgerDisplayRows(a, b, dateDescending));
}

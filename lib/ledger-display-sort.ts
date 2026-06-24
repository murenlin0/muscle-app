import type { TransactionCategory } from '@/lib/transaction-category';

/** 同日多筆：儲值 → 補差額 → 使用（+4000 在 -1000 上方） */
const MEMBER_ROW_ORDER: Partial<Record<TransactionCategory, number>> = {
  會員儲值: 0,
  會員補差額: 1,
  會員使用: 2,
};

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
  if (a.occurredOn !== b.occurredOn) {
    return dateDescending
      ? b.occurredOn.localeCompare(a.occurredOn)
      : a.occurredOn.localeCompare(b.occurredOn);
  }

  const ca = memberRowOrder(a.category);
  const cb = memberRowOrder(b.category);
  if (ca !== cb) return ca - cb;

  return dateDescending ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
}

export function sortLedgerDisplayRows<T extends LedgerSortRow>(
  rows: T[],
  dateDescending = true,
): T[] {
  return [...rows].sort((a, b) => compareLedgerDisplayRows(a, b, dateDescending));
}

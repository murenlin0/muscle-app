import type { TransactionCategory } from '@/lib/transaction-category';

const NEGATIVE_CATEGORIES = new Set<TransactionCategory>(['支出', '工資', '分紅', '轉出']);
const POSITIVE_CATEGORIES = new Set<TransactionCategory>(['轉入']);

/** 依類型正規化金額正負號 */
export function normalizeLedgerAmount(
  category: TransactionCategory,
  amount: number,
): number {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 0;
  if (NEGATIVE_CATEGORIES.has(category)) return -n;
  if (POSITIVE_CATEGORIES.has(category)) return n;
  return n;
}

export function shouldShowLedgerAccount(category: TransactionCategory): boolean {
  return category !== '會員使用';
}

export function isTransferCategory(category: TransactionCategory): boolean {
  return category === '轉出' || category === '轉入';
}

/** 從標題嘗試解析帳戶間轉移：現金移500到富邦 */
export function parseTransferFromTitle(title: string): {
  from: '現金' | '富邦';
  to: '現金' | '富邦';
  amount: number;
} | null {
  const t = title.replace(/\s/g, '');
  const m =
    t.match(/(現金|富邦).*?(\d+).*?(?:到|移|轉)(現金|富邦)/i) ??
    t.match(/(現金|富邦).*?(現金|富邦).*?(\d+)/);
  if (!m) return null;

  let from: string;
  let to: string;
  let amount: number;

  if (m.length === 4 && /^\d+$/.test(m[2])) {
    from = m[1];
    amount = Number(m[2]);
    to = m[3];
  } else if (m.length === 4) {
    from = m[1];
    to = m[2];
    amount = Number(m[3]);
  } else {
    return null;
  }

  if (!['現金', '富邦'].includes(from) || !['現金', '富邦'].includes(to) || from === to) {
    return null;
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return { from: from as '現金' | '富邦', to: to as '現金' | '富邦', amount };
}

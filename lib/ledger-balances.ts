import { normalizeLedgerAmount } from '@/lib/ledger-amount';
import { primaryLedgerAccount } from '@/lib/ledger-accounts';
import type { TransactionCategory } from '@/lib/transaction-category';

export interface LedgerBalanceRow {
  amount: number;
  category: string;
  payment_methods: string[];
}

/** Notion 算法：依「更動的帳戶」加總正規化後金額（支出／工資／分紅／轉出為負） */
export function sumLedgerAccountBalances(rows: LedgerBalanceRow[]): {
  cashOnHand: number;
  bankAccounts: number;
} {
  let cashOnHand = 0;
  let bankAccounts = 0;

  for (const row of rows) {
    const cat = row.category as TransactionCategory;
    const acc = primaryLedgerAccount(row.payment_methods ?? [], cat);
    if (!acc) continue;

    const amt = normalizeLedgerAmount(cat, row.amount ?? 0);
    if (acc === '現金') cashOnHand += amt;
    else if (acc === '富邦') bankAccounts += amt;
  }

  return { cashOnHand, bankAccounts };
}

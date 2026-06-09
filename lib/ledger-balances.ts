export interface LedgerBalanceRow {
  amount: number;
  category: string;
  payment_methods: string[];
}

const BANK_PM_ALIASES = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

function paymentMethodsHaveBank(pm: string[]): boolean {
  return pm.some((p) => BANK_PM_ALIASES.has(p) || BANK_PM_ALIASES.has(p.toLowerCase()));
}

/**
 * Notion 餘額算法：付款方式含現金／銀行帳戶者，各加一次資料庫內原始金額。
 * （與 Notion 報表加總一致，不依類型翻轉正負號）
 */
export function sumLedgerAccountBalances(rows: LedgerBalanceRow[]): {
  cashOnHand: number;
  bankAccounts: number;
} {
  let cashOnHand = 0;
  let bankAccounts = 0;

  for (const row of rows) {
    const pm = row.payment_methods ?? [];
    if (pm.includes('會員使用') || row.category === '會員使用') continue;

    const amt = Math.round(row.amount ?? 0);
    if (pm.includes('現金')) cashOnHand += amt;
    if (paymentMethodsHaveBank(pm)) bankAccounts += amt;
  }

  return { cashOnHand, bankAccounts };
}

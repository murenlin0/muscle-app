export interface LedgerBalanceRow {
  amount: number;
  category: string;
  payment_methods: string[];
}

/**
 * Notion 餘額算法：更動的帳戶含「現金」或「富邦」者，各加一次資料庫內原始金額。
 * （與 Notion 報表加總一致，不依類型翻轉正負號；略過會員使用）
 */
export function sumLedgerAccountBalances(rows: LedgerBalanceRow[]): {
  cashOnHand: number;
  /** 更動的帳戶＝富邦 之流水金額加總（不含 Line／街口／仁中信等已停用帳戶） */
  bankAccounts: number;
} {
  let cashOnHand = 0;
  let bankAccounts = 0;

  for (const row of rows) {
    const pm = row.payment_methods ?? [];
    if (pm.includes('會員使用') || row.category === '會員使用') continue;

    const amt = Math.round(row.amount ?? 0);
    if (pm.includes('現金')) cashOnHand += amt;
    if (pm.includes('富邦')) bankAccounts += amt;
  }

  return { cashOnHand, bankAccounts };
}

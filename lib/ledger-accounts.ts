/** 流水帳 — 更動的帳戶（僅現金、富邦） */
export const LEDGER_ACCOUNTS = ['現金', '富邦'] as const;

export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

const LEGACY_BANK_ALIASES = new Set(['line', '街口', '仁中信', '富邦', '轉帳']);

/** 舊 Notion 付款方式 → 更動的帳戶 */
export function normalizeLedgerAccount(raw: string): LedgerAccount | null {
  const s = raw.trim();
  if (!s || s === '會員使用') return null;
  if (s === '現金') return '現金';
  if (s === '富邦' || LEGACY_BANK_ALIASES.has(s) || LEGACY_BANK_ALIASES.has(s.toLowerCase())) {
    return '富邦';
  }
  return null;
}

export function normalizeLedgerAccounts(
  methods: string[],
  category?: string,
): LedgerAccount[] {
  if (category === '會員使用') return [];
  const out: LedgerAccount[] = [];
  for (const m of methods) {
    const acc = normalizeLedgerAccount(m);
    if (acc && !out.includes(acc)) out.push(acc);
  }
  return out;
}

export function primaryLedgerAccount(
  methods: string[],
  category?: string,
): LedgerAccount | '' {
  const list = normalizeLedgerAccounts(methods, category);
  return list[0] ?? '';
}

export function formatLedgerAccount(methods: string[], category?: string): string {
  return primaryLedgerAccount(methods, category);
}

export function parseLedgerAccountInput(raw: string): LedgerAccount[] {
  const acc = normalizeLedgerAccount(raw);
  return acc ? [acc] : [];
}

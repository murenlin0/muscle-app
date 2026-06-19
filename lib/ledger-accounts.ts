/** 流水帳 — 更動的帳戶（現金、富邦，及已停用的 仁中信／街口／Line） */
export const LEDGER_ACCOUNTS = ['現金', '富邦', '仁中信', '街口', 'Line'] as const;

export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

/** 已停用、餘額已轉空的舊帳戶（仍需在流水帳正確歸類，但財務總覽不單列） */
export const RETIRED_LEDGER_ACCOUNTS = ['仁中信', '街口', 'Line'] as const;

/** Notion 付款方式（小寫）→ 帳戶名稱 */
const ACCOUNT_ALIASES: Record<string, LedgerAccount> = {
  現金: '現金',
  富邦: '富邦',
  郵局: '富邦',
  轉帳: '富邦',
  仁中信: '仁中信',
  街口: '街口',
  line: 'Line',
};

/** 舊 Notion 付款方式 → 更動的帳戶 */
export function normalizeLedgerAccount(raw: string): LedgerAccount | null {
  const s = raw.trim();
  if (!s || s === '會員使用') return null;
  return ACCOUNT_ALIASES[s] ?? ACCOUNT_ALIASES[s.toLowerCase()] ?? null;
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

import { normalizeLedgerAccounts } from '@/lib/ledger-accounts';
import { normalizeLedgerAmount, parseTransferFromTitle } from '@/lib/ledger-amount';
import {
  LEGACY_TRANSFER_CATEGORY,
  type TransactionCategory,
} from '@/lib/transaction-category';

export interface TransferSourceRow {
  store_id: string;
  notion_page_id?: string | null;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  payment_methods: string[];
  service_type?: string | null;
  staff_name?: string | null;
  is_designated?: boolean;
  member_note?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  is_vip?: boolean;
  source?: string;
}

export interface SplitTransferResult {
  rows: TransferSourceRow[];
  deleteOriginal: boolean;
}

/** 將舊「轉移」單筆拆成轉出 + 轉入兩筆 */
export function splitLegacyTransferRow(row: TransferSourceRow): SplitTransferResult | null {
  if (row.category !== LEGACY_TRANSFER_CATEGORY) return null;

  const amt = Math.abs(Math.round(row.amount));
  if (amt <= 0) return null;

  const accounts = normalizeLedgerAccounts(row.payment_methods);
  let from = accounts[0];
  let to = accounts[1];

  if (!from || !to) {
    const parsed = parseTransferFromTitle(row.title);
    if (parsed) {
      from = parsed.from;
      to = parsed.to;
    }
  }

  if (!from || !to || from === to) return null;

  const base = {
    store_id: row.store_id,
    notion_page_id: row.notion_page_id,
    occurred_on: row.occurred_on,
    title: row.title,
    service_type: row.service_type ?? null,
    staff_name: row.staff_name ?? null,
    is_designated: row.is_designated ?? false,
    member_note: row.member_note ?? null,
    client_name: row.client_name ?? null,
    client_phone: row.client_phone ?? null,
    is_vip: row.is_vip ?? false,
    source: row.source ?? 'migration',
  };

  return {
    deleteOriginal: true,
    rows: [
      {
        ...base,
        category: '轉出' satisfies TransactionCategory,
        amount: normalizeLedgerAmount('轉出', amt),
        payment_methods: [from],
      },
      {
        ...base,
        notion_page_id: row.notion_page_id ? `${row.notion_page_id}:in` : null,
        category: '轉入' satisfies TransactionCategory,
        amount: normalizeLedgerAmount('轉入', amt),
        payment_methods: [to],
      },
    ],
  };
}

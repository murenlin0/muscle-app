/**
 * @deprecated 請改用 lib/ledger-accounts.ts（更動的帳戶）
 */
export {
  LEDGER_ACCOUNTS as PAYMENT_METHODS,
  type LedgerAccount as PaymentMethod,
  formatLedgerAccount as formatPaymentMethods,
  parseLedgerAccountInput as parsePaymentMethodsInput,
  normalizeLedgerAccounts,
  primaryLedgerAccount,
} from '@/lib/ledger-accounts';

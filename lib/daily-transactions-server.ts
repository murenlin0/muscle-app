import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeLedgerAccounts } from '@/lib/ledger-accounts';
import { normalizeLedgerAmount } from '@/lib/ledger-amount';
import type { StoreSlug } from '@/lib/stores';
import {
  TRANSACTION_CATEGORIES,
  type TransactionCategory,
} from '@/lib/transaction-category';

export interface TransactionInput {
  occurredOn: string;
  title: string;
  amount: number;
  category: TransactionCategory;
  paymentMethods: string[];
  staffName?: string | null;
}

function assertCategory(c: string): TransactionCategory {
  if (!(TRANSACTION_CATEGORIES as readonly string[]).includes(c)) {
    throw new Error('無效的類型');
  }
  return c as TransactionCategory;
}

export function normalizeTransactionInput(input: TransactionInput): TransactionInput {
  const category = assertCategory(input.category);
  return {
    ...input,
    title: input.title.trim(),
    amount: normalizeLedgerAmount(category, input.amount),
    paymentMethods: normalizeLedgerAccounts(input.paymentMethods, category),
  };
}

export async function createDailyTransaction(
  storeId: StoreSlug,
  input: TransactionInput,
) {
  const normalized = normalizeTransactionInput(input);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('daily_transactions')
    .insert({
      store_id: storeId,
      occurred_on: normalized.occurredOn,
      title: normalized.title,
      amount: normalized.amount,
      category: normalized.category,
      payment_methods: normalized.paymentMethods,
      staff_name: normalized.staffName ?? null,
      source: 'manual',
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateDailyTransaction(
  id: string,
  storeId: StoreSlug,
  input: Partial<TransactionInput>,
) {
  const supabase = getSupabaseAdmin();
  const needsExisting =
    input.amount !== undefined ||
    input.paymentMethods !== undefined ||
    input.category !== undefined;

  let existingCategory: TransactionCategory | undefined;
  let existingAmount = 0;
  let existingPaymentMethods: string[] = [];

  if (needsExisting) {
    const { data, error: fetchErr } = await supabase
      .from('daily_transactions')
      .select('category, amount, payment_methods')
      .eq('id', id)
      .eq('store_id', storeId)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    existingCategory = data.category as TransactionCategory;
    existingAmount = data.amount as number;
    existingPaymentMethods = (data.payment_methods as string[]) ?? [];
  }

  const category =
    input.category !== undefined ? assertCategory(input.category) : existingCategory;

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.occurredOn) payload.occurred_on = input.occurredOn;
  if (input.title !== undefined) payload.title = input.title.trim();
  if (category) payload.category = category;

  if (input.amount !== undefined && category) {
    payload.amount = normalizeLedgerAmount(category, input.amount);
  } else if (input.category !== undefined && category) {
    payload.amount = normalizeLedgerAmount(category, existingAmount);
  }

  if (input.paymentMethods !== undefined && category) {
    payload.payment_methods = normalizeLedgerAccounts(input.paymentMethods, category);
  } else if (input.category !== undefined && category) {
    payload.payment_methods = normalizeLedgerAccounts(existingPaymentMethods, category);
  }

  if (input.staffName !== undefined) payload.staff_name = input.staffName;

  const { error } = await supabase
    .from('daily_transactions')
    .update(payload)
    .eq('id', id)
    .eq('store_id', storeId);

  if (error) throw new Error(error.message);
}

export async function deleteDailyTransaction(id: string, storeId: StoreSlug) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('daily_transactions')
    .delete()
    .eq('id', id)
    .eq('store_id', storeId);

  if (error) throw new Error(error.message);
}

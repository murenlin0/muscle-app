import { syncClientFieldsFromTitle } from '@/lib/ledger-client-detect';
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
  clientName?: string | null;
  clientPhone?: string | null;
}

function assertCategory(c: string): TransactionCategory {
  if (!(TRANSACTION_CATEGORIES as readonly string[]).includes(c)) {
    throw new Error('無效的類型');
  }
  return c as TransactionCategory;
}

export function normalizeTransactionInput(input: TransactionInput): TransactionInput {
  const category = assertCategory(input.category);
  const title = input.title.trim();
  const client = syncClientFieldsFromTitle(title, category, {
    clientName: input.clientName ?? null,
    clientPhone: input.clientPhone ?? null,
  });
  return {
    ...input,
    title,
    amount: normalizeLedgerAmount(category, input.amount),
    paymentMethods: normalizeLedgerAccounts(input.paymentMethods, category),
    clientName: client.clientName,
    clientPhone: client.clientPhone,
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
      client_name: normalized.clientName ?? null,
      client_phone: normalized.clientPhone ?? null,
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
    input.category !== undefined ||
    (input.category !== undefined && input.title === undefined) ||
    (input.clientName === undefined &&
      input.clientPhone === undefined &&
      (input.title !== undefined || input.category !== undefined));

  let existingCategory: TransactionCategory | undefined;
  let existingAmount = 0;
  let existingPaymentMethods: string[] = [];
  let existingTitle = '';
  let existingClientName: string | null = null;
  let existingClientPhone: string | null = null;

  if (needsExisting) {
    const { data, error: fetchErr } = await supabase
      .from('daily_transactions')
      .select(
        'category, amount, payment_methods, title, client_name, client_phone',
      )
      .eq('id', id)
      .eq('store_id', storeId)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    existingCategory = data.category as TransactionCategory;
    existingAmount = data.amount as number;
    existingPaymentMethods = (data.payment_methods as string[]) ?? [];
    existingTitle = (data.title as string) ?? '';
    existingClientName = (data.client_name as string | null) ?? null;
    existingClientPhone = (data.client_phone as string | null) ?? null;
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

  if (
    input.title !== undefined ||
    input.category !== undefined ||
    input.clientName !== undefined ||
    input.clientPhone !== undefined
  ) {
    const effectiveTitle =
      input.title !== undefined ? input.title.trim() : existingTitle;
    const effectiveCategory = category ?? existingCategory ?? '一般消費';
    const detected = syncClientFieldsFromTitle(effectiveTitle, effectiveCategory, {
      clientName: input.clientName ?? existingClientName,
      clientPhone: input.clientPhone ?? existingClientPhone,
    });
    payload.client_name = detected.clientName;
    payload.client_phone = detected.clientPhone;
    payload.is_vip = detected.isVip;
  }

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

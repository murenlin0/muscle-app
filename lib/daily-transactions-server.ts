import { getSupabaseAdmin } from '@/lib/supabase';
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

export async function createDailyTransaction(
  storeId: StoreSlug,
  input: TransactionInput,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('daily_transactions')
    .insert({
      store_id: storeId,
      occurred_on: input.occurredOn,
      title: input.title.trim(),
      amount: Math.round(input.amount),
      category: assertCategory(input.category),
      payment_methods: input.paymentMethods,
      staff_name: input.staffName ?? null,
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
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.occurredOn) payload.occurred_on = input.occurredOn;
  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.amount !== undefined) payload.amount = Math.round(input.amount);
  if (input.category) payload.category = assertCategory(input.category);
  if (input.paymentMethods) payload.payment_methods = input.paymentMethods;
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

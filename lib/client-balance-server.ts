import {
  clientMemberBalance,
  type MemberBalanceRow,
} from '@/lib/ledger-title-balance';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { StoreSlug } from '@/lib/stores';

const MEMBER_CATEGORIES = ['會員儲值', '會員使用', '會員補差額'] as const;

export async function loadStoreMemberRows(storeId: StoreSlug): Promise<MemberBalanceRow[]> {
  const supabase = getSupabaseAdmin();
  const all: MemberBalanceRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_phone, client_name')
      .eq('store_id', storeId)
      .in('category', [...MEMBER_CATEGORIES])
      .order('occurred_on', { ascending: true })
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);

    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as MemberBalanceRow[];
    all.push(...chunk);
    if (chunk.length < 1000) break;
    offset += 1000;
  }

  return all;
}

/** 依流水帳加總的會員餘額（與 Notion 公式一致） */
export async function getClientBalanceFromLedger(
  storeId: StoreSlug,
  phone: string,
): Promise<number | null> {
  const rows = await loadStoreMemberRows(storeId);
  return clientMemberBalance(rows, phone);
}

/** 同步 clients.balance 欄位（供 LIFF 等讀表場景） */
export async function syncClientBalanceInDb(
  storeId: StoreSlug,
  phone: string,
): Promise<number | null> {
  const balance = await getClientBalanceFromLedger(storeId, phone);
  if (balance === null) return null;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('clients')
    .update({ balance, updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .eq('phone', phone);

  if (error) throw new Error(error.message);
  return balance;
}

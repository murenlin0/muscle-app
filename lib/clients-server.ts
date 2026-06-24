import { getSupabaseAdmin } from '@/lib/supabase';
import type { StoreSlug } from '@/lib/stores';
import {
  getClientBalanceFromLedger,
  loadStoreMemberRows,
  syncClientBalanceInDb,
} from '@/lib/client-balance-server';
import { clientMemberBalance } from '@/lib/ledger-title-balance';

export interface ClientListItem {
  id: string;
  name: string;
  phone: string;
  balance: number;
  isVip: boolean;
  isActive: boolean;
}

export async function listClients(storeId: StoreSlug): Promise<ClientListItem[]> {
  const supabase = getSupabaseAdmin();
  const [{ data, error }, memberRows] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, phone, balance, is_vip, is_active')
      .eq('store_id', storeId)
      .order('name'),
    loadStoreMemberRows(storeId),
  ]);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    balance: clientMemberBalance(memberRows, row.phone as string) ?? 0,
    isVip: Boolean(row.is_vip),
    isActive: Boolean(row.is_active),
  }));
}

export { getClientBalanceFromLedger, syncClientBalanceInDb };

export type LedgerType = 'initial' | 'top_up' | 'deduction' | 'adjustment';
export type LedgerSource = 'csv_import' | 'calendar_sync' | 'manual';
export type PaymentMethod = 'cash' | 'transfer' | 'line' | 'stored_value';
export type AdminRole = 'super' | 'store';
export type StoreId = 'store1' | 'store2';

export interface Store {
  id: StoreId;
  name: string;
  area: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AdminUser {
  id: string;
  user_id: string;
  role: AdminRole;
  store_id: StoreId | null;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  store_id: StoreId;
  phone: string;
  line_user_id: string | null;
  name: string;
  is_vip: boolean;
  initial_balance: number;
  balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  store_id: StoreId;
  name: string;
  duration_minutes: number;
  price_cash: number;
  price_member: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface Staff {
  id: string;
  store_id: StoreId;
  display_name: string;
  commission_rate: number | null;
  bonus_formula: Record<string, unknown>;
  is_active: boolean;
}

export interface LedgerRecord {
  id: string;
  client_id: string;
  type: LedgerType;
  type_label: string;
  amount: number;
  signed_amount: number;
  payment_method: PaymentMethod | null;
  source: LedgerSource;
  occurred_at: string;
  note: string | null;
  created_at: string;
}

export interface WalletSummary {
  client: Client;
  ledger: LedgerRecord[];
}

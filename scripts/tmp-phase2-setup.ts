import { createClient } from '@supabase/supabase-js';
import { scryptSync } from 'crypto';
import { hashStaffPin } from '../lib/staff-pin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SALT = process.env.PORTAL_PASSWORD_SALT ?? 'muscle-portal-change-me';

function hashPortalPassword(pw: string): string {
  return scryptSync(pw.trim(), SALT, 32).toString('hex');
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  // 1. 列出現有 store 帳號
  const { data: existing, error: listErr } = await sb
    .from('portal_accounts')
    .select('id, role, store_id, display_name, is_active')
    .eq('role', 'store');
  if (listErr) throw new Error(listErr.message);
  console.log('現有 store 帳號:', existing);

  // 2. 建立 portal_account_stores 表（用 supabase-js 無法執行 DDL，改用 rpc 或直接 insert）
  //    先 check 表是否存在
  const { error: tableCheck } = await sb
    .from('portal_account_stores')
    .select('id')
    .limit(1);
  if (tableCheck) {
    console.log('portal_account_stores 不存在，需手動執行 DDL。Error:', tableCheck.message);
  } else {
    console.log('portal_account_stores 已存在');
  }
}

main().catch(console.error);

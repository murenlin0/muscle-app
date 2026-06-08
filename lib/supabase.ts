import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

/** 單一 Supabase 專案；各店以 store_id 欄位區分 */
export function getSupabase(): SupabaseClient {
  if (browserClient) return browserClient;
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  browserClient = createClient(url, key);
  return browserClient;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY（請在 Vercel 環境變數設定 service_role key）');
  }
  if (key === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 不可與 anon key 相同');
  }
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** @deprecated 與 getSupabase() 相同，保留給舊呼叫端 */
export function getSupabaseForStore(): SupabaseClient {
  return getSupabase();
}

/** @deprecated 與 getSupabaseAdmin() 相同，保留給舊呼叫端 */
export function getSupabaseAdminForStore(): SupabaseClient {
  return getSupabaseAdmin();
}

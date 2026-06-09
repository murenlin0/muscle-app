import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { primaryLedgerAccount } from '@/lib/ledger-accounts';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnv();
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
const all: { amount: number; category: string; payment_methods: string[] }[] = [];
let from = 0;
while (true) {
  const { data, error } = await sb
    .from('daily_transactions')
    .select('amount, category, payment_methods')
    .eq('store_id', 'store1')
    .range(from, from + 999);
  if (error) throw error;
  if (!data?.length) break;
  all.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}

let cash = 0;
let bank = 0;
for (const r of all) {
  if (r.category === '會員使用') continue;
  const acc = primaryLedgerAccount(r.payment_methods ?? [], r.category);
  if (acc === '現金') cash += r.amount;
  if (acc === '富邦') bank += r.amount;
}

console.log('All cats except 會員使用 (incl 轉入轉出 儲值):');
console.log('  現金:', cash);
console.log('  富邦:', bank);
console.log('  合計:', cash + bank);
}

main().catch((e) => { console.error(e); process.exit(1); });

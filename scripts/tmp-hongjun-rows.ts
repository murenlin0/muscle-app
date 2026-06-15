import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { parseNotionNamePhone } from '../lib/phone';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

/** 電話與 已用/儲值 黏在一起：0987515163500/4000 → phone + used/stored */
function parseMergedPhoneBalance(title: string): {
  phone: string;
  used: number;
  stored: number;
  remaining: number;
  fullMatch: string;
  index: number;
} | null {
  const re = /(09\d{8})(\d{1,6})\/(\d{1,6})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title)) !== null) {
    const phone = m[1]!;
    const used = Number(m[2]);
    const stored = Number(m[3]);
    if (!Number.isFinite(used) || !Number.isFinite(stored)) continue;
    if (stored < used && used > 0) continue;
    return {
      phone,
      used,
      stored,
      remaining: stored - used,
      fullMatch: m[0],
      index: m.index,
    };
  }
  return null;
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('daily_transactions')
    .select('id, occurred_on, title, amount, category, client_name, client_phone')
    .eq('store_id', 'store1')
    .or('title.ilike.%0987515163%,client_phone.eq.0987515163')
    .order('occurred_on')
    .order('id');
  for (const r of data ?? []) {
    const merged = parseMergedPhoneBalance(r.title);
    console.log(`${r.occurred_on} [${r.category}] $${r.amount}`);
    console.log(`  ${r.title}`);
    if (merged) console.log(`  merged: phone=${merged.phone} used=${merged.used} stored=${merged.stored} remain=${merged.remaining}`);
    console.log('');
  }
}

main().catch(console.error);

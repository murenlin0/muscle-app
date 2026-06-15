import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { parseNotionNamePhone, stripVipPrefix } from '../lib/phone';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function balAfterDun(title: string): number | null {
  const idx = title.lastIndexOf('、');
  if (idx < 0) return null;
  const m = title.slice(idx + 1).match(/^\s*(-?\d+)/);
  return m ? Number(m[1]) : null;
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('daily_transactions')
    .select('id, occurred_on, title, amount, category, client_name, client_phone')
    .eq('store_id', 'store1')
    .or('client_phone.eq.0928507898,title.ilike.%0928507898%')
    .in('category', ['會員儲值', '會員使用', '會員補差額'])
    .order('occurred_on', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  console.log(`陳逸軒 0928507898 — member rows: ${data?.length ?? 0}\n`);
  for (const r of data ?? []) {
    const bal = balAfterDun(r.title);
    console.log(`${r.occurred_on} [${r.category}] $${r.amount} 餘額=${bal ?? '—'}`);
    console.log(`  ${r.title}`);
  }
}

main().catch(console.error);

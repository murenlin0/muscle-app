import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const apply = process.argv.includes('--apply');

  const { data, error } = await sb
    .from('daily_transactions')
    .select('id, occurred_on, title, amount, category')
    .eq('store_id', 'store1')
    .eq('occurred_on', '2025-03-03')
    .eq('category', '會員補差額')
    .or('client_phone.eq.0928507898,title.ilike.%0928507898%');

  if (error) throw new Error(error.message);
  if (!data?.length) {
    console.log('no row found');
    return;
  }

  const row = data[0]!;
  const newTitle = `+${Math.abs(row.amount)}、0VIP陳逸軒0928507898`;

  console.log('id:', row.id);
  console.log('舊:', row.title);
  console.log('新:', newTitle);

  if (!apply) {
    console.log('(dry-run，加 --apply 寫入)');
    return;
  }

  const { error: upErr } = await sb
    .from('daily_transactions')
    .update({ title: newTitle })
    .eq('id', row.id);
  if (upErr) throw new Error(upErr.message);
  console.log('updated');
}

main().catch(console.error);

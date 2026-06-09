import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { count } = await sb
    .from('daily_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', 'store1');

  const { data: minRow } = await sb
    .from('daily_transactions')
    .select('occurred_on')
    .eq('store_id', 'store1')
    .order('occurred_on', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: maxRow } = await sb
    .from('daily_transactions')
    .select('occurred_on')
    .eq('store_id', 'store1')
    .order('occurred_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log('Total rows:', count);
  console.log('Earliest:', minRow?.occurred_on);
  console.log('Latest:', maxRow?.occurred_on);

  // count by year
  const all: { occurred_on: string }[] = [];
  let from = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on')
      .eq('store_id', 'store1')
      .range(from, from + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const byYear = new Map<string, number>();
  for (const r of all) {
    const y = r.occurred_on.slice(0, 7);
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  console.log('\nRows by month:');
  for (const [k, v] of [...byYear.entries()].sort()) console.log(`  ${k}: ${v}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

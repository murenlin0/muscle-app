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

  const from = '2024-03-01';
  const to = '2026-06-04';
  const pageSize = 1000;

  for (const offset of [0, 1000, 2000, 3000]) {
    const { data, error, count } = await sb
      .from('daily_transactions')
      .select('id, occurred_on', { count: 'exact' })
      .eq('store_id', 'store1')
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const dates = data?.map((r) => r.occurred_on) ?? [];
    console.log(
      `offset ${offset}: rows=${data?.length ?? 0} count=${count} min=${dates[dates.length - 1]} max=${dates[0]}`,
    );
  }

  // loop like production
  const all: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id')
      .eq('store_id', 'store1')
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data.map((r) => r.id));
    console.log(`page offset=${offset} got=${data.length} total=${all.length}`);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  console.log('final total', all.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

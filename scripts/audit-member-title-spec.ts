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

type Row = {
  id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  store_id: string;
  client_name: string | null;
  client_phone: string | null;
};

async function fetchAll(): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const out: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, store_id, client_name, client_phone')
      .in('category', ['會員使用', '會員儲值'])
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

function compact(s: string) {
  return s.replace(/[\s\u3000]+/g, '');
}

function main2(rows: Row[]) {
  let ok = 0;
  const missingSign: Row[] = [];
  const missingBalance: Row[] = [];
  const signMismatch: Row[] = [];

  for (const r of rows) {
    const t = compact(r.title);
    const hasBalance = /、\d+/.test(t) || /、-?\d+\/\d+/.test(t);
    const legacy = /-?\d+\/\d+VIP/i.test(t);

    let hasSign = false;
    let signAmountOk = true;
    if (r.category === '會員儲值') {
      const m = t.match(/\+(\d+)/);
      hasSign = !!m;
      if (m) signAmountOk = Number(m[1]) === Math.abs(r.amount);
    } else {
      const m = t.match(/-(\d+)/);
      hasSign = !!m;
      if (m) signAmountOk = Number(m[1]) === Math.abs(r.amount);
    }

    if (legacy && !hasSign) {
      // 舊式 3400/4000VIP 視為另一類
    }

    if (hasSign && hasBalance && signAmountOk) {
      ok += 1;
      continue;
    }
    if (!hasSign) missingSign.push(r);
    else if (!signAmountOk) signMismatch.push(r);
    if (!hasBalance) missingBalance.push(r);
  }

  console.log(`total member rows: ${rows.length}`);
  console.log(`ok: ${ok}`);
  console.log(`missing +/- sign: ${missingSign.length}`);
  console.log(`sign amount mismatch: ${signMismatch.length}`);
  console.log(`missing 、balance: ${missingBalance.length}`);

  console.log('\n--- missing sign (first 40) ---');
  for (const r of missingSign.slice(0, 40)) {
    console.log(`${r.occurred_on} [${r.category}] amt=${r.amount} store=${r.store_id} | ${r.title}`);
  }
  console.log('\n--- sign mismatch (first 20) ---');
  for (const r of signMismatch.slice(0, 20)) {
    console.log(`${r.occurred_on} [${r.category}] amt=${r.amount} store=${r.store_id} | ${r.title}`);
  }
  console.log('\n--- missing balance (first 40) ---');
  for (const r of missingBalance.slice(0, 40)) {
    console.log(`${r.occurred_on} [${r.category}] amt=${r.amount} store=${r.store_id} | ${r.title}`);
  }
}

async function main() {
  loadEnv();
  const rows = await fetchAll();
  main2(rows);
}

main().catch(console.error);

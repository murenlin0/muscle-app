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

  const all: {
    occurred_on: string;
    amount: number;
    payment_methods: string[];
  }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on, amount, payment_methods')
      .eq('store_id', 'store1')
      .order('occurred_on', { ascending: true })
      .range(offset, offset + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  function sum(from: string, cashOnlyExact: boolean, bankOnlyExact: boolean) {
    let cash = 0;
    let bank = 0;
    for (const r of all) {
      if (r.occurred_on < from) continue;
      const pm = r.payment_methods ?? [];
      const hasCash = pm.includes('現金');
      const hasBankExact = pm.includes('富邦');
      const hasBankLegacy = pm.some((p) => ['Line', '街口', '仁中信', '轉帳'].includes(p));
      if (hasCash && (!cashOnlyExact || pm.length === 1)) cash += r.amount;
      if (hasBankExact && (!bankOnlyExact || !hasBankLegacy)) bank += r.amount;
      if (!bankOnlyExact && hasBankLegacy) bank += r.amount;
    }
    return { cash, bank, total: cash + bank };
  }

  const targets = [
    { cash: 16398, bank: 119947 },
    { cash: 16398, bank: 119947 },
  ];

  for (const from of ['2024-03-16', '2025-01-01', '2026-01-01', '2025-12-01']) {
    const a = sum(from, false, false);
    const b = sum(from, true, true);
    console.log(`from ${from} all aliases: cash=${a.cash} bank=${a.bank}`);
    console.log(`from ${from} exact only: cash=${b.cash} bank=${b.bank}`);
  }

  function balRange(from: string, to: string) {
    let cash = 0;
    let bank = 0;
    for (const r of all) {
      if (r.occurred_on < from || r.occurred_on > to) continue;
      const pm = r.payment_methods ?? [];
      if (pm.includes('現金')) cash += r.amount;
      if (pm.includes('富邦')) bank += r.amount;
    }
    return { cash, bank };
  }

  for (const [f, t] of [
    ['2026-01-01', '2026-06-03'],
    ['2025-12-30', '2026-06-03'],
    ['2024-03-16', '2026-06-03'],
  ] as const) {
    const x = balRange(f, t);
    console.log(`\n${f}..${t} 現金=${x.cash} 富邦=${x.bank}`);
  }

  // rows with only 富邦 tag (like Notion filter)
  let bankFubonOnly = 0;
  let cashOnly = 0;
  for (const r of all) {
    if (r.occurred_on < '2024-03-16') continue;
    const pm = r.payment_methods ?? [];
    if (pm.length === 1 && pm[0] === '富邦') bankFubonOnly += r.amount;
    if (pm.length === 1 && pm[0] === '現金') cashOnly += r.amount;
  }
  console.log('\nSingle-tag only from 2024-03-16:');
  console.log('  現金:', cashOnly, '富邦:', bankFubonOnly);
}

main().catch(console.error);

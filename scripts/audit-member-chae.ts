/**
 * 稽核「會員補差額」來源
 * npx tsx scripts/audit-member-chae.ts
 */
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
  const { data } = await sb
    .from('daily_transactions')
    .select(
      'occurred_on, amount, category, service_type, source, payment_methods, title, notion_page_id',
    )
    .eq('store_id', 'store1')
    .eq('category', '會員補差額')
    .order('occurred_on', { ascending: true });

  const rows = data ?? [];
  const bySvc: Record<string, number> = {};
  const bySrc: Record<string, number> = {};
  let sum = 0;
  for (const r of rows) {
    sum += Math.abs(r.amount ?? 0);
    const st = r.service_type ?? '(null)';
    bySvc[st] = (bySvc[st] ?? 0) + 1;
    const src = r.source ?? '(null)';
    bySrc[src] = (bySrc[src] ?? 0) + 1;
  }

  console.log(`會員補差額 ${rows.length} 筆，金額合計 $${sum.toLocaleString()}\n`);
  console.log('service_type（Notion 原始類型）:', bySvc);
  console.log('source:', bySrc);
  console.log('\n明細：');
  for (const r of rows) {
    const pm = (r.payment_methods ?? []).join(',') || '(空)';
    console.log(
      `${r.occurred_on} $${Math.abs(r.amount)} [${r.service_type}] [${pm}] ${r.title.slice(0, 55)}`,
    );
  }
}

main().catch(console.error);

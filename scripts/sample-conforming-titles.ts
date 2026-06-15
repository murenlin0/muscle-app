/** 取樣已符合格式的會員標題，供對齊寫法 */
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
  const out: { occurred_on: string; title: string; amount: number; category: string }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('occurred_on, title, amount, category')
      .in('category', ['會員使用', '會員儲值'])
      .order('occurred_on', { ascending: false })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as any));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  const topup = out.filter((r) => r.category === '會員儲值' && /\+\s*\d/.test(r.title) && r.title.includes('、'));
  const use = out.filter((r) => r.category === '會員使用' && /(?:^|[^\d/])-\s*\d/.test(r.title) && r.title.includes('、'));

  console.log('=== 會員儲值（合規樣本 10）===');
  for (const r of topup.slice(0, 10)) console.log(`${r.occurred_on} amt=${r.amount} | ${r.title}`);
  console.log('\n=== 會員使用（合規樣本 10）===');
  for (const r of use.slice(0, 10)) console.log(`${r.occurred_on} amt=${r.amount} | ${r.title}`);
}

main().catch(console.error);

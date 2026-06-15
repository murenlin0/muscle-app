/**
 * A1 剩餘 6 筆人工確認後寫回
 * npx tsx scripts/fix-a1-titles.ts [--apply]
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

type Patch = {
  match: { occurred_on: string; category: string; titleContains: string };
  title: string;
  client_name: string;
  client_phone: string;
};

const PATCHES: Patch[] = [
  {
    match: { occurred_on: '2025-05-31', category: '會員儲值', titleContains: '簡煒修0933565678/VIP曾祐鈴' },
    title: '錦+4000、4300VIP曾祐鈴0937016728',
    client_name: '曾祐鈴',
    client_phone: '0937016728',
  },
  {
    match: { occurred_on: '2025-05-31', category: '會員使用', titleContains: '簡煒修0933565678/VIP曾祐鈴' },
    title: '錦60分-1000、3300VIP曾祐鈴0937016728',
    client_name: '曾祐鈴',
    client_phone: '0937016728',
  },
  {
    match: { occurred_on: '2025-10-28', category: '會員儲值', titleContains: 'VIP陳傳宗0939363703/老婆' },
    title: '仁60分+4000、4000VIP陳傳宗0939363703',
    client_name: '陳傳宗',
    client_phone: '0939363703',
  },
  {
    match: { occurred_on: '2025-10-28', category: '會員使用', titleContains: 'VIP陳傳宗0939363703/老婆' },
    title: '仁60分-1000、3000VIP陳傳宗0939363703',
    client_name: '陳傳宗',
    client_phone: '0939363703',
  },
  {
    match: { occurred_on: '2025-11-26', category: '會員使用', titleContains: 'VIP施順雄0930906500/跑班' },
    title: '錦60分-1000、2000VIP跑班施順雄0930906500',
    client_name: '跑班施順雄',
    client_phone: '0930906500',
  },
  {
    match: { occurred_on: '2025-12-01', category: '會員使用', titleContains: 'VIP施順雄0930906500/跑班' },
    title: '錦60分-1000、1000VIP跑班施順雄0930906500',
    client_name: '跑班施順雄',
    client_phone: '0930906500',
  },
];

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  for (const p of PATCHES) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, title')
      .eq('occurred_on', p.match.occurred_on)
      .eq('category', p.match.category)
      .like('title', `%${p.match.titleContains}%`);
    if (error) throw error;
    if (!data?.length) {
      console.log(`未找到: ${p.match.occurred_on} ${p.match.category} ${p.match.titleContains}`);
      continue;
    }
    for (const row of data) {
      console.log(`\n${p.match.occurred_on} [${p.match.category}]`);
      console.log(`  舊: ${row.title}`);
      console.log(`  新: ${p.title}`);
      if (apply) {
        const { error: upErr } = await sb
          .from('daily_transactions')
          .update({ title: p.title, client_name: p.client_name, client_phone: p.client_phone })
          .eq('id', row.id);
        if (upErr) console.error('  失敗:', upErr.message);
        else console.log('  ✓ updated');
      }
    }
  }
  if (!apply) console.log('\n(dry-run，加 --apply 寫回)');
}

main().catch(console.error);

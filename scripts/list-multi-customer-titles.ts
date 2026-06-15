/**
 * 列出 A 類：多人合寫（標題無法歸到單一客人）
 * npx tsx scripts/list-multi-customer-titles.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { resolveClientFromFields } from '../lib/ledger-client-display';
import { getSupabaseAdmin } from '../lib/supabase';
import { parseNotionNamePhone } from '../lib/phone';
import { categoryShowsClient } from '../lib/ledger-client-detect';
import type { TransactionCategory } from '../lib/transaction-category';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function isMultiCustomer(title: string): boolean {
  if (parseNotionNamePhone(title) !== null) return false;
  if (!/VIP|09\d{8}/i.test(title)) return false;
  return /\/|（|使用|老婆|客人|跑團|馬拉松|朋友|兒子|男友|\/VIP/i.test(title);
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const rows: {
    id: string;
    occurred_on: string;
    title: string;
    amount: number;
    category: string;
    client_name: string | null;
    client_phone: string | null;
  }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_name, client_phone')
      .eq('store_id', 'store1')
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  const hits = rows.filter((r) => {
    if (!categoryShowsClient(r.category as TransactionCategory)) return false;
    return isMultiCustomer(r.title);
  });

  // 依標題分組（同一種合寫算一組）
  const byTitle = new Map<string, typeof hits>();
  for (const r of hits) {
    const key = r.title.trim();
    const arr = byTitle.get(key) ?? [];
    arr.push(r);
    byTitle.set(key, arr);
  }

  const groups = [...byTitle.entries()].sort((a, b) => b[1].length - a[1].length);

  const lines: string[] = [
    `A 類：多人合寫 — 共 ${hits.length} 筆交易、${groups.length} 種標題`,
    '',
  ];

  let n = 1;
  for (const [title, list] of groups) {
    const first = list[0]!;
    const dates = list.map((r) => r.occurred_on);
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    lines.push(`${n}. 【${list.length} 筆】${first.category} · $${first.amount}`);
    lines.push(`   標題: ${title}`);
    lines.push(`   日期: ${minDate}${minDate !== maxDate ? ` ~ ${maxDate}` : ''}`);
    lines.push('');
    n += 1;
  }

  writeFileSync('multi-customer-A-list.txt', lines.join('\n'), 'utf8');
  console.log(lines.join('\n'));
  console.log(`\n已寫入 multi-customer-A-list.txt`);
}

main().catch(console.error);

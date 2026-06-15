import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { sumUnusedBalancesFromTitles } from '../lib/ledger-title-balance';
import { parseNotionNamePhone, stripVipPrefix } from '../lib/phone';

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
  client_name: string | null;
  client_phone: string | null;
};

function balAfterDun(title: string): number | null {
  const idx = title.lastIndexOf('、');
  if (idx < 0) return null;
  const m = title.slice(idx + 1).match(/^\s*(-?\d+)/);
  return m ? Number(m[1]) : null;
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const rows: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, client_name, client_phone')
      .eq('store_id', 'store1')
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .like('title', '%、%')
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  const total = sumUnusedBalancesFromTitles(rows);
  console.log(`rows with dun: ${rows.length}`);
  console.log(`unusedMemberBalance: ${total}`);

  // per-client latest，邏輯與 sumUnusedBalancesFromTitles 一致
  function nameKey(r: Row): string | null {
    if (r.client_name) {
      const n = stripVipPrefix(r.client_name).trim();
      if (n) return n;
    }
    const matches = [...r.title.matchAll(/VIP\s*([\u4e00-\u9fffA-Za-z]{2,12})/gi)];
    return matches[matches.length - 1]?.[1] ?? null;
  }
  const nameToPhone = new Map<string, string>();
  for (const r of rows) {
    const phone = r.client_phone ?? parseNotionNamePhone(r.title)?.phone ?? null;
    const name = nameKey(r);
    if (phone && name && !nameToPhone.has(name)) nameToPhone.set(name, phone);
  }
  const latest = new Map<string, { date: string; balance: number; label: string }>();
  for (const r of rows) {
    const bal = balAfterDun(r.title);
    if (bal === null) continue;
    const phone = r.client_phone ?? parseNotionNamePhone(r.title)?.phone ?? null;
    const name = nameKey(r);
    const key = phone ?? (name ? nameToPhone.get(name) ?? `name:${name}` : null);
    if (!key) continue;
    const ex = latest.get(key);
    if (!ex || r.occurred_on > ex.date) {
      latest.set(key, { date: r.occurred_on, balance: bal, label: `${name ?? '?'} ${phone ?? `(無電話→${nameToPhone.get(name ?? '') ?? '獨立'})`}` });
    }
  }
  const list = [...latest.values()].sort((a, b) => b.balance - a.balance);
  const lines = list.map((c) => `${c.balance}\t${c.date}\t${c.label}`);
  writeFileSync('unused-balance-list.txt', lines.join('\n'), 'utf8');
  console.log(`clients counted: ${list.length} (list written to unused-balance-list.txt)`);
  console.log('top 15:');
  for (const c of list.slice(0, 15)) console.log(`  ${c.balance}\t${c.date}\t${c.label}`);
  const neg = list.filter((c) => c.balance < 0);
  console.log(`negative balances: ${neg.length}, sum=${neg.reduce((s, c) => s + c.balance, 0)}`);
}

main().catch(console.error);

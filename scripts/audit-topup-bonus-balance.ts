/**
 * 找「儲值金額」與「、後餘額」不符的活動列（如 +10000 但餘額 10500 = 送 500）
 * npx tsx scripts/audit-topup-bonus-balance.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { stripAllSpaces } from '../lib/phone';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

interface Parsed {
  topup: number;
  song: number;
  usage: number | null;
  balance: number;
  raw: string;
}

interface Hit {
  source: 'db' | 'notion';
  date: string;
  title: string;
  amount: number;
  category: string;
  payment: string;
  parsed: Parsed;
  bonus: number;
}

function parseTitle(title: string): Parsed | null {
  const t = stripAllSpaces(title);

  const full = t.match(/\+(\d{3,5})(?:送(\d+))?(?:-(\d+))?、(\d+)VIP/i);
  if (full) {
    return {
      topup: Number(full[1]),
      song: full[2] ? Number(full[2]) : 0,
      usage: full[3] ? Number(full[3]) : null,
      balance: Number(full[4]),
      raw: full[0],
    };
  }

  const simple = t.match(/\+(\d{3,5})、(\d+)VIP/i);
  if (simple) {
    return {
      topup: Number(simple[1]),
      song: 0,
      usage: null,
      balance: Number(simple[2]),
      raw: simple[0],
    };
  }

  return null;
}

function scan(
  source: 'db' | 'notion',
  row: { date: string; title: string; amount: number; category: string; payment: string },
): Hit | null {
  const parsed = parseTitle(row.title);
  if (!parsed) return null;
  const bonus = parsed.balance - parsed.topup;
  if (bonus <= 0) return null;
  return { source, date: row.date, title: row.title, amount: row.amount, category: row.category, payment: row.payment, parsed, bonus };
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const dbHits: Hit[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on, title, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .or('title.ilike.%+%,title.ilike.%10500%')
      .range(o, o + 999);
    if (!data?.length) break;
    for (const r of data) {
      const hit = scan('db', {
        date: r.occurred_on,
        title: r.title,
        amount: r.amount,
        category: r.category,
        payment: (r.payment_methods ?? []).join(','),
      });
      if (hit) dbHits.push(hit);
    }
    if (data.length < 1000) break;
    o += 1000;
  }

  console.log('=== DB：標題「、」後餘額 > +儲值金額 ===\n');
  console.log(`共 ${dbHits.length} 筆\n`);

  const exact10500 = dbHits.filter((h) => h.parsed.topup === 10000 && h.parsed.balance === 10500);
  console.log(`【+10000 → 餘額10500（送500）】${exact10500.length} 筆`);
  for (const h of exact10500) {
    console.log(`${h.date} ${h.category} $${h.amount} [${h.payment}]`);
    console.log(`  ${h.title}\n`);
  }

  const withSong500 = dbHits.filter((h) => h.parsed.song === 500);
  console.log(`\n【標題含「送500」且餘額>儲值】${withSong500.length} 筆`);
  for (const h of withSong500) {
    const implied = h.parsed.topup + h.parsed.song - (h.parsed.usage ?? 0);
    console.log(
      `${h.date} +${h.parsed.topup}送${h.parsed.song}${h.parsed.usage ? `-${h.parsed.usage}` : ''}、${h.parsed.balance} (儲值+送點-使用=${h.parsed.topup + h.parsed.song}-${h.parsed.usage ?? 0}=${h.parsed.topup + h.parsed.song - (h.parsed.usage ?? 0)} vs 標題餘額${h.parsed.balance})`,
    );
    console.log(`  ${h.title.slice(0, 75)}`);
  }

  console.log('\n【其他送點組合】');
  for (const h of dbHits.filter((x) => x.parsed.song !== 500)) {
    console.log(
      `${h.date} +${h.parsed.topup}${h.parsed.song ? `送${h.parsed.song}` : ''} → 餘額${h.parsed.balance} (多${h.bonus}) ${h.category} $${h.amount}`,
    );
    console.log(`  ${h.title.slice(0, 75)}`);
  }

  const { data: has10500 } = await sb
    .from('daily_transactions')
    .select('occurred_on, title, amount, category')
    .eq('store_id', 'store1')
    .ilike('title', '%10500%');
  console.log(`\n=== 標題含「10500」共 ${has10500?.length ?? 0} 筆 ===`);
  for (const r of has10500 ?? []) {
    console.log(`${r.occurred_on} ${r.category} $${r.amount} ${r.title}`);
  }

  console.log('\n=== Notion ===');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const nHits = notion
    .map((r) =>
      scan('notion', {
        date: r.dateStart?.slice(0, 10) ?? '',
        title: r.title,
        amount: r.amount,
        category: r.serviceType ?? '',
        payment: (r.paymentMethods ?? []).join(','),
      }),
    )
    .filter(Boolean) as Hit[];
  const nExact = nHits.filter((h) => h.parsed.topup === 10000 && h.parsed.balance === 10500);
  console.log(`餘額>儲值 ${nHits.length} 筆；+10000→10500：${nExact.length} 筆`);
  for (const h of nExact) {
    console.log(`${h.date} $${h.amount} ${h.title}`);
  }
}

main().catch(console.error);

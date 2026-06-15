/**
 * 列出名字／電話格式有問題的客人紀錄。
 * npx tsx scripts/audit-weird-clients.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { resolveClientFromFields } from '../lib/ledger-client-display';
import { getSupabaseAdmin } from '../lib/supabase';
import { normalizePhone, parseNotionNamePhone, stripVipPrefix } from '../lib/phone';
import { categoryShowsClient } from '../lib/ledger-client-detect';
import type { TransactionCategory } from '../lib/transaction-category';

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
  category: string;
  client_name: string | null;
  client_phone: string | null;
};

type Issue =
  | '無法解析電話'
  | '電話格式錯誤'
  | '無法解析名字'
  | '名字含異常字元'
  | '名字過短或過長'
  | '多人合寫'
  | '欄位與標題不一致'
  | '標題無VIP段'
  | '電話位數異常'
  | '同電話多名'
  | '同名字多電話';

interface WeirdEntry {
  issues: Issue[];
  name: string | null;
  phone: string | null;
  dbName: string | null;
  dbPhone: string | null;
  sampleDate: string;
  sampleTitle: string;
  sampleId: string;
  rowCount: number;
}

function nameIssues(name: string): Issue[] {
  const out: Issue[] = [];
  if (!name || name.length < 2) out.push('名字過短或過長');
  if (name.length > 12) out.push('名字過短或過長');
  if (/[、+\-分儲值送\d|（）()]/.test(name)) out.push('名字含異常字元');
  if (/^\d+$/.test(name)) out.push('名字含異常字元');
  if (/先生|小姐|老婆|客人|使用|結清|富邦|Line|街口|仁中信|儲值/.test(name)) out.push('名字含異常字元');
  return out;
}

function phoneIssues(phone: string | null): Issue[] {
  if (!phone) return ['無法解析電話'];
  if (!/^09\d{8}$/.test(phone)) return ['電話格式錯誤'];
  return [];
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const rows: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, category, client_name, client_phone')
      .eq('store_id', 'store1')
      .order('occurred_on', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  const clientRows = rows.filter((r) => categoryShowsClient(r.category as TransactionCategory));

  // key -> aggregated info
  const byKey = new Map<string, WeirdEntry>();
  const phoneToNames = new Map<string, Set<string>>();
  const nameToPhones = new Map<string, Set<string>>();

  for (const row of clientRows) {
    const cat = row.category as TransactionCategory;
    const parsed = parseNotionNamePhone(row.title);
    const resolved = resolveClientFromFields(row.title, cat, row.client_name, row.client_phone);

    const issues: Issue[] = [];

    if (!parsed && !row.client_phone) {
      if (/VIP/i.test(row.title) || /09\d{8}/.test(row.title)) {
        if (parseNotionNamePhone(row.title) === null && /\/|（|使用|老婆|客人/.test(row.title)) {
          issues.push('多人合寫');
        } else {
          issues.push('無法解析電話');
        }
      } else if (/09\d{8}/.test(row.title)) {
        issues.push('無法解析名字');
      } else if (categoryShowsClient(cat)) {
        issues.push('無法解析電話');
      }
    }

    if (parsed === null && /\/|（|使用|老婆|客人/.test(row.title) && /VIP|09\d{8}/.test(row.title)) {
      if (!issues.includes('多人合寫')) issues.push('多人合寫');
    }

    const phone = resolved?.phone ?? parsed?.phone ?? row.client_phone;
    const name = resolved?.name ?? parsed?.name ?? (row.client_name ? stripVipPrefix(row.client_name) : null);

    issues.push(...phoneIssues(phone));
    if (name) issues.push(...nameIssues(name));
    else if (phone) issues.push('無法解析名字');

    if (row.client_name && row.client_phone && parsed) {
      const dbName = stripVipPrefix(row.client_name);
      if (row.client_phone !== parsed.phone || dbName !== parsed.name) {
        issues.push('欄位與標題不一致');
      }
    }

    if (phone && name) {
      if (!phoneToNames.has(phone)) phoneToNames.set(phone, new Set());
      phoneToNames.get(phone)!.add(name);
      if (!nameToPhones.has(name)) nameToPhones.set(name, new Set());
      nameToPhones.get(name)!.add(phone);
    }

    // weird phone in title directly
    const rawPhones = [...row.title.matchAll(/0?\d{9,11}/g)].map((m) => m[0]);
    for (const raw of rawPhones) {
      const norm = normalizePhone(raw);
      if (raw.length >= 10 && !norm) issues.push('電話位數異常');
      if (norm && norm.length !== 10) issues.push('電話位數異常');
    }

    if (!issues.length) continue;

    const key = phone ? `phone:${phone}` : name ? `name:${name}` : `title:${row.title.slice(0, 40)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.rowCount += 1;
      for (const i of issues) if (!existing.issues.includes(i)) existing.issues.push(i);
      if (row.occurred_on > existing.sampleDate) {
        existing.sampleDate = row.occurred_on;
        existing.sampleTitle = row.title;
        existing.sampleId = row.id;
      }
    } else {
      byKey.set(key, {
        issues: [...new Set(issues)],
        name,
        phone,
        dbName: row.client_name ? stripVipPrefix(row.client_name) : null,
        dbPhone: row.client_phone,
        sampleDate: row.occurred_on,
        sampleTitle: row.title,
        sampleId: row.id,
        rowCount: 1,
      });
    }
  }

  // cross-row consistency
  for (const [phone, names] of phoneToNames) {
    if (names.size > 1) {
      const key = `phone:${phone}`;
      const entry = byKey.get(key) ?? {
        issues: [],
        name: [...names][0] ?? null,
        phone,
        dbName: null,
        dbPhone: phone,
        sampleDate: '',
        sampleTitle: '',
        sampleId: '',
        rowCount: 0,
      };
      if (!entry.issues.includes('同電話多名')) entry.issues.push('同電話多名');
      entry.name = [...names].join(' / ');
      byKey.set(key, entry);
    }
  }
  for (const [name, phones] of nameToPhones) {
    if (phones.size > 1) {
      for (const phone of phones) {
        const key = `phone:${phone}`;
        const entry = byKey.get(key);
        if (entry && !entry.issues.includes('同名字多電話')) {
          entry.issues.push('同名字多電話');
        }
      }
    }
  }

  const list = [...byKey.values()]
    .filter((e) => e.issues.length > 0)
    .sort((a, b) => {
      const rank = (issues: Issue[]) =>
        issues.includes('多人合寫') ? 0 : issues.includes('無法解析電話') ? 1 : 2;
      return rank(a.issues) - rank(b.issues) || b.rowCount - a.rowCount;
    });

  const lines: string[] = [
    `掃描 ${clientRows.length} 筆含客人欄位交易，發現 ${list.length} 組異常客人`,
    '',
  ];

  for (const e of list) {
    lines.push(`【${e.issues.join('、')}】共 ${e.rowCount} 筆`);
    lines.push(`  名字: ${e.name ?? '—'}  電話: ${e.phone ?? '—'}`);
    if (e.dbName || e.dbPhone) lines.push(`  DB欄: ${e.dbName ?? '—'} / ${e.dbPhone ?? '—'}`);
    lines.push(`  最近: ${e.sampleDate} | ${e.sampleTitle}`);
    lines.push('');
  }

  writeFileSync('weird-clients-report.txt', lines.join('\n'), 'utf8');
  console.log(lines.slice(0, 80).join('\n'));
  console.log(`\n...完整 ${list.length} 組已寫入 weird-clients-report.txt`);
}

main().catch(console.error);

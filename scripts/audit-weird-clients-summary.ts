import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { resolveClientFromFields } from '../lib/ledger-client-display';
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

type Row = { id: string; occurred_on: string; title: string; category: string; client_name: string | null; client_phone: string | null };

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const rows: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.from('daily_transactions').select('id, occurred_on, title, category, client_name, client_phone').eq('store_id', 'store1').order('occurred_on').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  type Client = { name: string | null; phone: string | null; issues: Set<string>; count: number; sample: string };
  const clients = new Map<string, Client>();

  function add(key: string, c: Partial<Client> & { issues: string[] }) {
    const ex = clients.get(key);
    if (ex) {
      c.issues.forEach((i) => ex.issues.add(i));
      ex.count += c.count ?? 1;
      if ((c.sample ?? '') > ex.sample) ex.sample = c.sample!;
    } else {
      clients.set(key, { name: c.name ?? null, phone: c.phone ?? null, issues: new Set(c.issues), count: c.count ?? 1, sample: c.sample ?? '' });
    }
  }

  const phoneToNames = new Map<string, Set<string>>();

  for (const row of rows) {
    const cat = row.category as TransactionCategory;
    if (!categoryShowsClient(cat)) continue;

    const parsed = parseNotionNamePhone(row.title);
    const resolved = resolveClientFromFields(row.title, cat, row.client_name, row.client_phone);
    const phone = resolved?.phone ?? parsed?.phone ?? row.client_phone;
    const name = resolved?.name ?? parsed?.name ?? (row.client_name ? stripVipPrefix(row.client_name) : null);

    const issues: string[] = [];
    const isTransfer = /to\s*(仁信|富邦|現金|Line|line|街口)/i.test(row.title);
    if (isTransfer) continue;

    if (parsed === null && /\/|（|使用|老婆|客人|\/VIP|\/跑團|\/馬拉松|\/朋友|兒子|男友/.test(row.title) && /VIP|09\d{8}/.test(row.title)) {
      issues.push('多人合寫');
    }
    if (!phone) {
      if (/09\d{8}/.test(row.title)) {
        const raw = row.title.match(/09\d{8,}/)?.[0];
        if (raw && raw.length > 10) issues.push('電話多一位');
        else issues.push('有電話但解析失敗');
      } else issues.push('無電話');
    } else {
      if (!/^09\d{8}$/.test(phone)) issues.push('電話格式錯');
      const rawInTitle = row.title.match(new RegExp(`${phone}\\d`));
      if (rawInTitle || (phone && row.title.includes(phone + '2'))) issues.push('電話多一位');
    }
    if (name && /先生|小姐|老婆|客人|兒子|男友|跑團|馬拉松|電話約|待確認|推薦|熟客|錦友|仁友|朋友|介紹/.test(name)) issues.push('名字異常');
    if (name && name.length > 8 && !/^[A-Za-z\s]+$/.test(name)) issues.push('名字過長');

    if (!issues.length) {
      if (phone && name) {
        if (!phoneToNames.has(phone)) phoneToNames.set(phone, new Set());
        phoneToNames.get(phone)!.add(name);
      }
      continue;
    }

    const key = phone ? `p:${phone}` : name ? `n:${name}` : `t:${row.title.slice(0, 30)}`;
    add(key, { name, phone, issues, sample: `${row.occurred_on} ${row.title}` });
  }

  for (const [phone, names] of phoneToNames) {
    if (names.size <= 1) continue;
    const key = `p:${phone}`;
    add(key, { name: [...names].join(' / '), phone, issues: ['同電話多名'], sample: '', count: 0 });
    const ex = clients.get(key);
    if (ex) ex.count = Math.max(ex.count, 1);
  }

  const groups: Record<string, Client[]> = {};
  for (const c of clients.values()) {
    const primary = [...c.issues][0]!;
    const bucket = c.issues.has('多人合寫') ? 'A.多人合寫' : c.issues.has('無電話') ? 'B.完全無電話' : c.issues.has('電話多一位') ? 'C.電話多一位' : c.issues.has('同電話多名') ? 'D.同電話多名' : c.issues.has('名字異常') ? 'E.名字異常' : 'F.其他';
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(c);
  }
  for (const g of Object.values(groups)) g.sort((a, b) => b.count - a.count);

  const lines: string[] = [];
  for (const [bucket, list] of Object.entries(groups).sort()) {
    lines.push(`\n## ${bucket}（${list.length} 人）\n`);
    for (const c of list) {
      lines.push(`- ${c.name ?? '（無名）'} ${c.phone ?? '（無電話）'} [${[...c.issues].join('、')}] ${c.count}筆`);
      if (c.sample) lines.push(`  例：${c.sample}`);
    }
  }
  writeFileSync('weird-clients-summary.txt', lines.join('\n'), 'utf8');
  console.log(lines.join('\n'));
  console.log(`\n共 ${clients.size} 組，已寫入 weird-clients-summary.txt`);
}

main().catch(console.error);

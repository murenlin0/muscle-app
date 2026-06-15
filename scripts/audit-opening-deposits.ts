/** 列出 A 類（累計淨額<0）客人與應補期初儲值 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { parseBalanceAfter顿号 } from '../lib/ledger-title-balance';
import { parseNotionNamePhone, stripVipPrefix } from '../lib/phone';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

type Row = { id: string; occurred_on: string; title: string; amount: number; category: string; client_name: string | null; client_phone: string | null };

function phoneKey(r: Row): string | null {
  if (r.client_phone) return r.client_phone;
  return parseNotionNamePhone(r.title)?.phone ?? null;
}
function nameKey(r: Row): string | null {
  if (r.client_name) { const n = stripVipPrefix(r.client_name).trim(); if (n) return n; }
  const ms = [...r.title.matchAll(/VIP\s*([\u4e00-\u9fffA-Za-z]{2,12})/gi)];
  return ms[ms.length - 1]?.[1] ?? null;
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const rows: Row[] = [];
  let o = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_name, client_phone')
      .eq('store_id', 'store1').lte('occurred_on', today)
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .range(o, o + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
    o += 1000;
  }

  const nameToPhone = new Map<string, string>();
  for (const r of rows) { const p = phoneKey(r), n = nameKey(r); if (p && n && !nameToPhone.has(n)) nameToPhone.set(n, p); }
  const keyOf = (r: Row) => { const p = phoneKey(r); if (p) return p; const n = nameKey(r); return n ? (nameToPhone.get(n) ?? `name:${n}`) : null; };

  const groups = new Map<string, Row[]>();
  for (const r of rows) { const k = keyOf(r); if (!k) continue; const arr = groups.get(k) ?? []; arr.push(r); groups.set(k, arr); }

  const lines: string[] = [];
  const log = (s = '') => { lines.push(s); console.log(s); };
  log('=== A 類：累計淨額<0，應補期初儲值 ===\n');

  const clean: any[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.occurred_on !== b.occurred_on ? a.occurred_on.localeCompare(b.occurred_on) : a.id.localeCompare(b.id));
    let net = 0;
    for (const r of list) { const a = Math.round(r.amount ?? 0); net += r.category === '會員使用' ? -a : a; }
    if (net >= 0) continue;
    let latestBal: number | null = null, latestTitle = '';
    for (let i = list.length - 1; i >= 0; i -= 1) { const b = parseBalanceAfter顿号(list[i]!.title); if (b !== null) { latestBal = b; latestTitle = list[i]!.title; break; } }
    const lb = latestBal ?? 0;
    const deposit = lb - net;

    // 嘗試取得 名字 / 電話
    const phone = key.startsWith('name:') ? null : key;
    const name = nameKey(list[list.length - 1]!);
    const noPhone = !phone;
    const compound = /\//.test(latestTitle) || (latestTitle.match(/09\d{8}/g)?.length ?? 0) > 1;
    const proposedTitle = phone
      ? `+${deposit}、${deposit}VIP${name}${phone}`
      : `+${deposit}、${deposit}VIP${name}(無電話)`;

    log(`${noPhone ? '【無電話】' : ''}${compound ? '【合寫需確認】' : ''}key=${key}`);
    log(`  名字=${name} 電話=${phone ?? '無'} 最新餘額=${lb} 累計淨額=${net} 應補儲值=${deposit}`);
    log(`  最新列: ${latestTitle}`);
    log(`  擬新增(2024-03-01 會員儲值 師傅=仁 付款方式空白): ${proposedTitle}\n`);

    if (phone && !compound) clean.push({ phone, name, deposit, title: proposedTitle });
  }

  log(`\n可自動處理(單一電話、非合寫): ${clean.length} 筆`);
  writeFileSync(resolve(process.cwd(), 'audit-opening-deposits.txt'), lines.join('\n'), 'utf8');
}

main().catch(console.error);

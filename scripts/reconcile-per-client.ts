/**
 * 逐客人比對：累計淨額(儲值-使用+補差額) vs 最新標題頓號餘額
 * npx tsx scripts/reconcile-per-client.ts
 */
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
      .eq('store_id', 'store1')
      .lte('occurred_on', today)
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .range(o, o + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
    o += 1000;
  }

  // 名字→電話 對照
  const nameToPhone = new Map<string, string>();
  for (const r of rows) {
    const p = phoneKey(r), n = nameKey(r);
    if (p && n && !nameToPhone.has(n)) nameToPhone.set(n, p);
  }
  const keyOf = (r: Row) => {
    const p = phoneKey(r); if (p) return p;
    const n = nameKey(r); return n ? (nameToPhone.get(n) ?? `name:${n}`) : null;
  };

  // 分組
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r); if (!k) continue;
    const arr = groups.get(k) ?? []; arr.push(r); groups.set(k, arr);
  }

  type Stat = { key: string; net: number; latestBal: number | null; latestDate: string; diff: number; sample: string };
  const stats: Stat[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.occurred_on !== b.occurred_on ? a.occurred_on.localeCompare(b.occurred_on) : a.id.localeCompare(b.id));
    let net = 0;
    for (const r of list) {
      const a = Math.round(r.amount ?? 0);
      net += r.category === '會員使用' ? -a : a;
    }
    let latestBal: number | null = null; let latestDate = ''; let sample = '';
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const b = parseBalanceAfter顿号(list[i]!.title);
      if (b !== null) { latestBal = b; latestDate = list[i]!.occurred_on; sample = list[i]!.title; break; }
    }
    const lb = latestBal ?? 0;
    stats.push({ key, net, latestBal, latestDate, diff: lb - net, sample });
  }

  const totalNet = stats.reduce((s, x) => s + x.net, 0);
  const totalLatest = stats.reduce((s, x) => s + (x.latestBal ?? 0), 0);

  const lines: string[] = [];
  const log = (s = '') => { lines.push(s); };
  log(`客人數: ${stats.length}`);
  log(`累計淨額總計: $${totalNet.toLocaleString()}`);
  log(`最新頓號餘額總計: $${totalLatest.toLocaleString()}`);
  log(`差異(最新-累計): $${(totalLatest - totalNet).toLocaleString()}`);

  // 分類差異原因
  const latestDatedRowHasNoDun = new Map<string, boolean>();
  const hasRefund = new Map<string, boolean>();
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.occurred_on !== b.occurred_on ? a.occurred_on.localeCompare(b.occurred_on) : a.id.localeCompare(b.id));
    const lastRow = sorted[sorted.length - 1]!;
    latestDatedRowHasNoDun.set(key, parseBalanceAfter顿号(lastRow.title) === null);
    hasRefund.set(key, list.some((r) => r.category === '會員補差額' && Math.round(r.amount ?? 0) < 0));
  }

  const diffs = stats.filter((s) => s.diff !== 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  let bucketNegNet = 0, bucketRefund = 0, bucketLatestNoDun = 0, bucketOther = 0;
  let cNeg = 0, cRef = 0, cNoDun = 0, cOther = 0;
  for (const s of diffs) {
    if (s.net < 0) { bucketNegNet += s.diff; cNeg += 1; }
    else if (hasRefund.get(s.key)) { bucketRefund += s.diff; cRef += 1; }
    else if (latestDatedRowHasNoDun.get(s.key)) { bucketLatestNoDun += s.diff; cNoDun += 1; }
    else { bucketOther += s.diff; cOther += 1; }
  }

  log('\n=== 差異原因分類（對 41,500 的貢獻）===');
  log(`  A 累計淨額為負(期初餘額未記成儲值/欠額): ${cNeg} 人, $${bucketNegNet.toLocaleString()}`);
  log(`  B 有退款(補差額為負)但收據未反映: ${cRef} 人, $${bucketRefund.toLocaleString()}`);
  log(`  C 最新日期列無頓號(沿用舊餘額): ${cNoDun} 人, $${bucketLatestNoDun.toLocaleString()}`);
  log(`  D 其他(同日排序/頓號不連貫): ${cOther} 人, $${bucketOther.toLocaleString()}`);

  log(`\n=== 有差異的客人 (${diffs.length}) ===`);
  for (const s of diffs) {
    const tag = s.net < 0 ? 'A負淨額' : hasRefund.get(s.key) ? 'B退款' : latestDatedRowHasNoDun.get(s.key) ? 'C最新列無頓號' : 'D其他';
    log(`\n[${tag}] ${s.key}  最新餘額=${s.latestBal} 累計淨額=${s.net} 差=${s.diff} (最新列 ${s.latestDate})`);
    log(`  例: ${s.sample}`);
  }

  writeFileSync(resolve(process.cwd(), 'reconcile-per-client-report.txt'), lines.join('\n'), 'utf8');
  console.log(lines.slice(0, 4).join('\n'));
  console.log(`\n有差異客人: ${diffs.length}，詳見 reconcile-per-client-report.txt`);
}

main().catch(console.error);

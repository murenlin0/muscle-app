/**
 * 補上 store2 支援現金列漏填「使用位置」的 payment_methods
 * ⚠️ 已改為唯讀預覽；請用 sync-notion-daily 或 revert-store2-support-cash-pm 處理。
 *
 * 預覽：npx tsx scripts/backfill-store2-support-cash-pm.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';

function loadEnvFile(name: string): void {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]?.trim()) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

const SUPPORT_CASH_TITLE = /支援.*現金|現金領|支援領現|現領工資/;

async function main() {
  loadEnvFile('.env.production.tmp');
  loadEnvFile('.env.local');

  const sb = getSupabaseAdmin();
  const { data: rows, error } = await sb
    .from('daily_transactions')
    .select('id, notion_page_id, title, payment_methods, occurred_on, amount')
    .eq('store_id', 'store2')
    .gte('occurred_on', '2026-05-01')
    .lte('occurred_on', '2026-06-20');

  if (error) throw error;

  const targets = (rows ?? []).filter(
    (r) =>
      !(r.payment_methods ?? []).length &&
      SUPPORT_CASH_TITLE.test(r.title ?? ''),
  );

  console.log(`【唯讀】待補列: ${targets.length}`);
  for (const r of targets) {
    console.log(`  ${r.occurred_on} $${r.amount} ${r.notion_page_id} ${r.title}`);
  }
  console.log('\n此腳本不再寫入 DB。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

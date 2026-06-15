/**
 * 驗證店內現金 / 富邦帳戶加總 vs Notion
 * npx tsx scripts/check-cash-fubon-sums.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { sumLedgerAccountBalances } from '../lib/ledger-balances';

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
  const today = new Date().toISOString().slice(0, 10);

  const rows: { amount: number; category: string; payment_methods: string[] }[] = [];
  let o = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('amount, category, payment_methods')
      .eq('store_id', 'store1')
      .lte('occurred_on', today)
      .range(o, o + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as any));
    if (data.length < 1000) break;
    o += 1000;
  }

  const { cashOnHand, bankAccounts } = sumLedgerAccountBalances(rows);

  let dbCashOnly = 0;
  let dbFubonOnly = 0;
  let dbCashCount = 0;
  let dbFubonCount = 0;
  for (const r of rows) {
    if (r.category === '會員使用') continue;
    const pm = r.payment_methods ?? [];
    const amt = Math.round(r.amount ?? 0);
    if (pm.includes('現金')) {
      dbCashOnly += amt;
      dbCashCount += 1;
    }
    if (pm.includes('富邦')) {
      dbFubonOnly += amt;
      dbFubonCount += 1;
    }
  }

  console.log('=== DB（至今日）===');
  console.log(`sumLedgerAccountBalances 店內現金: $${cashOnHand.toLocaleString()} (${dbCashCount} 筆含現金)`);
  console.log(`sumLedgerAccountBalances 銀行帳戶(現算法): $${bankAccounts.toLocaleString()}`);
  console.log(`手動加總 更動的帳戶=現金: $${dbCashOnly.toLocaleString()}`);
  console.log(`手動加總 更動的帳戶=富邦: $${dbFubonOnly.toLocaleString()} (${dbFubonCount} 筆)`);

  console.log('\n載入 Notion…');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  let notionCash = 0;
  let notionFubon = 0;
  let notionCashN = 0;
  let notionFubonN = 0;
  for (const r of notion) {
    if (r.serviceType === '會員使用' || r.paymentMethods.includes('會員使用')) continue;
    const amt = Math.round(r.amount);
    if (r.paymentMethods.includes('現金')) {
      notionCash += amt;
      notionCashN += 1;
    }
    if (r.paymentMethods.includes('富邦')) {
      notionFubon += amt;
      notionFubonN += 1;
    }
  }

  console.log('\n=== Notion ===');
  console.log(`付款方式含現金 金額數字加總: $${notionCash.toLocaleString()} (${notionCashN} 筆)`);
  console.log(`付款方式含富邦 金額數字加總: $${notionFubon.toLocaleString()} (${notionFubonN} 筆)`);

  console.log('\n=== 對照 ===');
  console.log(`店內現金 DB vs Notion: ${cashOnHand === notionCash ? '✓ 一致' : `✗ DB ${cashOnHand} vs Notion ${notionCash}`}`);
  console.log(`富邦 DB vs Notion: ${dbFubonOnly === notionFubon ? '✓ 一致' : `✗ DB ${dbFubonOnly} vs Notion ${notionFubon}`}`);
  console.log(`現「銀行帳戶」算法 vs 僅富邦: ${bankAccounts === dbFubonOnly ? '✓ 相同' : `不同 現算法=${bankAccounts} 僅富邦=${dbFubonOnly}`}`);
}

main().catch(console.error);

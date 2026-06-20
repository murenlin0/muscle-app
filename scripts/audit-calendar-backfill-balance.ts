/**
 * 對帳：納入全部會員歷史，檢查 6/11 起 calendar_backfill 的頓號餘額
 * npx tsx scripts/audit-calendar-backfill-balance.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { auditCalendarBackfillBalances } from '../lib/calendar-backfill-sync';

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // 使用已設定的 process.env
  }
}

async function main() {
  loadEnv();
  const fromDate =
    process.argv.find((a) => a.startsWith('--from='))?.slice(7) ?? '2026-06-11';

  console.log(`對帳 calendar_backfill（${fromDate} 起，含全部會員歷史）…\n`);

  const mismatches = await auditCalendarBackfillBalances('store1', fromDate);

  if (!mismatches.length) {
    console.log('✓ 全部 backfill 會員列：頓號餘額與累計一致');
    return;
  }

  console.log(`⚠ 不符 ${mismatches.length} 筆：\n`);
  for (const m of mismatches) {
    console.log(`${m.occurredOn} [${m.category}] $${m.amount} ${m.clientPhone ?? ''}`);
    console.log(`  標題頓號=${m.titleBalance}  累計=${m.computedBalance}  差=${m.titleBalance - (m.computedBalance ?? 0)}`);
    console.log(`  ${m.title.slice(0, 90)}`);
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

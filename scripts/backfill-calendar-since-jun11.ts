/**
 * 自 6/11 起匯入 Google 日曆已結帳事件到報表（不限師傅 UI）
 *
 * 預覽：npx tsx scripts/backfill-calendar-since-jun11.ts --dry-run
 * 正式：npx tsx scripts/backfill-calendar-since-jun11.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { syncCalendarBackfill } from '../lib/calendar-backfill-sync';

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
  const dryRun = process.argv.includes('--dry-run');
  const fromDate = process.argv.find((a) => a.startsWith('--from='))?.slice(7) ?? '2026-06-11';
  const toDate = process.argv.find((a) => a.startsWith('--to='))?.slice(5);
  const storeId = (process.argv.find((a) => a.startsWith('--store='))?.slice(8) ?? 'store1') as
    | 'store1'
    | 'store2';

  console.log(
    `${dryRun ? '[預覽]' : '[正式]'} 匯入日曆結帳 ${fromDate}${toDate ? `～${toDate}` : ' 起'}（${storeId}）…\n`,
  );

  const result = await syncCalendarBackfill({
    fromDate,
    toDate,
    storeId,
    dryRun,
  });

  console.log(`掃描事件：${result.scanned}`);
  console.log(`已結帳色：${result.checkoutColored}`);
  console.log(`${dryRun ? '將匯入' : '已匯入'}：${result.imported} 筆流水帳列`);
  console.log(`略過（已匯）：${result.skippedExisting}`);
  console.log(`略過（無法解析）：${result.skippedPending}`);

  if (result.errors.length) {
    console.log(`\n錯誤 ${result.errors.length} 筆：`);
    for (const e of result.errors.slice(0, 20)) console.log(`  · ${e}`);
  }

  if (result.titles.length) {
    console.log(`\n匯入標題（前 15）：`);
    for (const t of result.titles.slice(0, 15)) console.log(`  · ${t}`);
  }

  if (result.balanceMismatches.length) {
    console.log(`\n⚠ 餘額不符 ${result.balanceMismatches.length} 筆（標題頓號 vs 累計計算）：`);
    for (const m of result.balanceMismatches.slice(0, 30)) {
      console.log(
        `  ${m.occurredOn} [${m.category}] $${m.amount} ${m.clientPhone ?? ''}`,
      );
      console.log(`    標題餘額=${m.titleBalance}  計算=${m.computedBalance}`);
      console.log(`    ${m.title.slice(0, 80)}`);
    }
  } else {
    console.log('\n✓ 會員列餘額與標題頓號一致（或無頓號可比對）');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 列出並補匯：日曆有、報表無（標題/電話比對，不重複 notion_import）
 *   npx tsx scripts/backfill-missing-cal-smart.ts           # 預覽
 *   npx tsx scripts/backfill-missing-cal-smart.ts --apply   # 寫入
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { syncCalendarBackfill } from '../lib/calendar-backfill-sync';
import { getIntegrationSetting } from '../lib/integration-settings';
import { formatStoreDateIso } from '../lib/store-timezone';

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1]!.trim()]) {
        process.env[m[1]!.trim()] = m[2]!.trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

const FROM = '2026-06-01';

async function main() {
  loadEnv();
  const dbToken = await getIntegrationSetting('google_refresh_token');
  if (dbToken) process.env.GOOGLE_REFRESH_TOKEN = dbToken;
  const apply = process.argv.includes('--apply');
  const to = formatStoreDateIso(new Date(), 'store1');
  const opts = {
    fromDate: FROM,
    toDate: to,
    storeId: 'store1' as const,
    skipIfReportRowExists: true,
    ignoreAppointmentGate: true,
  };

  console.log(`=== 民有店 ${FROM}～${to}：日曆有、報表無 ===\n`);

  const preview = await syncCalendarBackfill({ ...opts, dryRun: true });
  if (!preview.titles.length) {
    console.log('✓ 無缺漏，不需補匯');
    return;
  }

  console.log(`將補匯 ${preview.titles.length} 事件（約 ${preview.imported} 列）：\n`);
  preview.titles.forEach((t, i) => console.log(`${i + 1}. ${t}`));

  console.log(
    `\n略過：gcal已有 ${preview.skippedExisting} · 報表已有 ${preview.skippedReportMatch}`,
  );

  if (!apply) {
    console.log('\n（預覽模式，加 --apply 才寫入 DB）');
    return;
  }

  console.log('\n--- 寫入中 ---');
  const result = await syncCalendarBackfill({ ...opts, dryRun: false });
  console.log(`完成：寫入 ${result.imported} 列`);
  if (result.errors.length) {
    console.log('錯誤：');
    result.errors.forEach((e) => console.log(' ', e));
  }
  if (result.balanceMismatches.length) {
    console.log(`餘額頓號待核：${result.balanceMismatches.length} 筆（已寫入）`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 從 Notion 每日紀錄同步到 Supabase daily_transactions
 *
 * 用法：
 *   NOTION_API_KEY=secret_xxx npm run sync:notion
 *   NOTION_API_KEY=secret_xxx npm run sync:notion -- --store store2
 *   NOTION_API_KEY=secret_xxx npm run sync:notion -- --dry-run
 *   NOTION_API_KEY=secret_xxx npm run sync:notion -- --no-fix-notion
 */
import { loadEnvLocal } from '../lib/load-env-local';

loadEnvLocal();
import {
  buildNotionStaffUpdate,
  buildNotionTitleUpdate,
  getNotionDailyDbId,
  queryNotionDatabaseAll,
  updateNotionPageProperties,
} from '../lib/notion-api';
import {
  mapNotionRowToTransaction,
  previewNotionNormalizations,
  upsertDailyTransactions,
} from '../lib/notion-daily-import';
import { migrateLedgerData } from '../lib/ledger-migrate-server';
import {
  normalizeNotionTitle,
  normalizeStaffName,
} from '../lib/notion-title-normalize';
import { isStoreSlug, type StoreSlug } from '../lib/stores';

const dryRun = process.argv.includes('--dry-run');
const fixNotion = !process.argv.includes('--no-fix-notion');

function parseStoreArg(): StoreSlug {
  const idx = process.argv.indexOf('--store');
  const value = idx >= 0 ? process.argv[idx + 1] : 'store1';
  if (!value || !isStoreSlug(value)) {
    console.error(`無效分店：${value ?? '(未指定)'}（請用 store1 或 store2）`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const storeId = parseStoreArg();
  const databaseId = getNotionDailyDbId(storeId);

  console.log(`抓取 Notion 資料庫 ${databaseId}（${storeId}）…`);
  const rows = await queryNotionDatabaseAll(databaseId);
  console.log(`共 ${rows.length} 筆`);

  const previews = previewNotionNormalizations(rows);
  console.log(`需正規化標題/師傅：${previews.length} 筆`);

  if (fixNotion && !dryRun) {
    let updated = 0;
    for (const p of previews) {
      const props: Record<string, unknown> = {};
      if (p.newTitle !== p.oldTitle.trim()) {
        Object.assign(props, buildNotionTitleUpdate(p.newTitle));
      }
      if (p.newStaff && p.oldStaff && p.newStaff !== p.oldStaff) {
        Object.assign(props, buildNotionStaffUpdate(p.newStaff));
      }
      if (Object.keys(props).length) {
        await updateNotionPageProperties(p.pageId, props);
        updated += 1;
      }
    }
    console.log(`Notion 已更新 ${updated} 筆`);
  }

  const transactions = rows.map((row) =>
    mapNotionRowToTransaction(
      {
        ...row,
        title: normalizeNotionTitle(row.title),
        staffName: normalizeStaffName(row.staffName),
      },
      storeId,
    ),
  );

  const latest = transactions.reduce<string | null>((max, r) => {
    if (!max || r.occurred_on > max) return r.occurred_on;
    return max;
  }, null);

  if (dryRun) {
    console.log('dry-run：不寫入 Supabase');
    console.log('最新日期', latest);
    console.log('正規化範例', previews.slice(0, 3));
    return;
  }

  const { upserted } = await upsertDailyTransactions(transactions);
  console.log(`已 upsert ${upserted} 筆`);

  const report = await migrateLedgerData(storeId);
  console.log('migrate:', JSON.stringify(report));
  console.log('最新日期', latest);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/portal-api';
import {
  buildNotionStaffUpdate,
  buildNotionTitleUpdate,
  NOTION_STORE1_DAILY_DB_ID,
  queryNotionDatabaseAll,
  updateNotionPageProperties,
} from '@/lib/notion-api';
import {
  mapNotionRowToTransaction,
  previewNotionNormalizations,
  upsertDailyTransactions,
} from '@/lib/notion-daily-import';
import {
  normalizeNotionTitle,
  normalizeStaffName,
} from '@/lib/notion-title-normalize';
import type { StoreSlug } from '@/lib/stores';

export async function POST(request: Request) {
  const session = await requireSuperAdmin();
  if (session instanceof NextResponse) return session;

  let body: {
    storeId?: StoreSlug;
    databaseId?: string;
    fixNotion?: boolean;
    dryRun?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const storeId = body.storeId ?? 'store1';
  const databaseId = body.databaseId ?? NOTION_STORE1_DAILY_DB_ID;
  const fixNotion = body.fixNotion === true;
  const dryRun = Boolean(body.dryRun);

  try {
    const notionRows = await queryNotionDatabaseAll(databaseId);
    const previews = previewNotionNormalizations(notionRows);

    let notionUpdated = 0;
    if (fixNotion && !dryRun) {
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
          notionUpdated += 1;
        }
      }
    }

    const transactions = notionRows.map((row) => {
      const normalized = {
        ...row,
        title: normalizeNotionTitle(row.title),
        staffName: normalizeStaffName(row.staffName),
      };
      return mapNotionRowToTransaction(normalized, storeId);
    });

    let upserted = 0;
    if (!dryRun) {
      const result = await upsertDailyTransactions(transactions);
      upserted = result.upserted;
    }

    const latest = transactions.reduce<string | null>((max, row) => {
      if (!max || row.occurred_on > max) return row.occurred_on;
      return max;
    }, null);

    return NextResponse.json({
      ok: true,
      dryRun,
      notionRows: notionRows.length,
      notionNormalizeCandidates: previews.length,
      notionUpdated: dryRun ? 0 : notionUpdated,
      upserted: dryRun ? 0 : upserted,
      latestRecordDate: latest,
      normalizeSample: previews.slice(0, 5),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '同步失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/portal-api';
import {
  buildNotionStaffUpdate,
  buildNotionTitleUpdate,
  getNotionDailyDbId,
  queryNotionDatabaseAll,
  updateNotionPageProperties,
} from '@/lib/notion-api';
import {
  mapNotionRowToTransaction,
  previewNotionNormalizations,
  upsertDailyTransactions,
} from '@/lib/notion-daily-import';
import { migrateLedgerData } from '@/lib/ledger-migrate-server';
import { normalizeStaffName } from '@/lib/notion-title-normalize';
import { isStoreSlug, type StoreSlug } from '@/lib/stores';

export async function POST(request: Request) {
  const session = await requireSuperAdmin();
  if (session instanceof NextResponse) return session;

  let body: {
    storeId?: StoreSlug;
    databaseId?: string;
    fixNotion?: boolean;
    dryRun?: boolean;
    wipeBeforeSync?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!body.storeId || !isStoreSlug(body.storeId)) {
    return NextResponse.json({ error: '請提供 storeId' }, { status: 400 });
  }

  const storeId = body.storeId;
  const databaseId = body.databaseId ?? getNotionDailyDbId(storeId);
  const fixNotion = body.fixNotion === true;
  const dryRun = Boolean(body.dryRun);
  const wipeBeforeSync = body.wipeBeforeSync === true;

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

    const transactions = notionRows.map((row) =>
      mapNotionRowToTransaction(
        { ...row, staffName: normalizeStaffName(row.staffName) },
        storeId,
      ),
    );

    let upserted = 0;
    let wiped = 0;
    let migrateReport = null as Awaited<ReturnType<typeof migrateLedgerData>> | null;
    if (!dryRun) {
      if (wipeBeforeSync) {
        const { getSupabaseAdmin } = await import('@/lib/supabase');
        const { count, error: wipeErr } = await getSupabaseAdmin()
          .from('daily_transactions')
          .delete({ count: 'exact' })
          .eq('store_id', storeId);
        if (wipeErr) throw new Error(wipeErr.message);
        wiped = count ?? 0;
      }
      const result = await upsertDailyTransactions(transactions);
      upserted = result.upserted;
      if (wipeBeforeSync) {
        migrateReport = await migrateLedgerData(storeId);
      }
    }

    const latest = transactions.reduce<string | null>((max, row) => {
      if (!max || row.occurred_on > max) return row.occurred_on;
      return max;
    }, null);

    return NextResponse.json({
      ok: true,
      storeId,
      databaseId,
      dryRun,
      notionRows: notionRows.length,
      notionNormalizeCandidates: previews.length,
      notionUpdated: dryRun ? 0 : notionUpdated,
      upserted: dryRun ? 0 : upserted,
      wiped: dryRun ? 0 : wiped,
      migrateReport,
      latestRecordDate: latest,
      normalizeSample: previews.slice(0, 5),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '同步失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

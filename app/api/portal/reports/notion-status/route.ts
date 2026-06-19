import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/portal-api';
import { getNotionDailyDbId, probeNotionConnection } from '@/lib/notion-api';
import { isStoreSlug, type StoreSlug } from '@/lib/stores';

export async function GET(request: Request) {
  const session = await requireSuperAdmin();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const storeParam = url.searchParams.get('store');
  if (!storeParam || !isStoreSlug(storeParam)) {
    return NextResponse.json({ error: '請提供 store 參數' }, { status: 400 });
  }
  const storeId = storeParam;
  const databaseId = getNotionDailyDbId(storeId);

  const result = await probeNotionConnection(databaseId);
  return NextResponse.json({
    ...result,
    storeId,
    vercelEnv: process.env.VERCEL_ENV ?? 'local',
  });
}

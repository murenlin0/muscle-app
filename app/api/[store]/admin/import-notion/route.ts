import { NextResponse } from 'next/server';
import { parseStoreFromParamsAsync } from '@/lib/api-store';
import { importNotionCsvFromText } from '@/lib/import-notion-server';
import { canAccessStore, getPortalSession } from '@/lib/portal-session';

export async function POST(
  request: Request,
  context: { params: Promise<{ store: string }> },
) {
  const store = await parseStoreFromParamsAsync(context.params);
  if (store instanceof NextResponse) return store;

  const session = await getPortalSession();
  const secret = request.headers.get('x-admin-secret');
  const expected = process.env.ADMIN_IMPORT_SECRET;
  const sessionOk = session && canAccessStore(session, store);

  if (expected && secret !== expected && !sessionOk) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '請上傳 CSV 檔' }, { status: 400 });
  }

  try {
    const csvText = await file.text();
    const result = await importNotionCsvFromText(csvText, file.name, store);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : '匯入失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

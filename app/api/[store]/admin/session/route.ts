import { NextResponse } from 'next/server';
import { parseStoreFromParamsAsync } from '@/lib/api-store';
import { canAccessStore, getPortalSession } from '@/lib/portal-session';

export async function GET(
  _request: Request,
  context: { params: Promise<{ store: string }> },
) {
  const store = await parseStoreFromParamsAsync(context.params);
  if (store instanceof NextResponse) return store;

  const session = await getPortalSession();
  if (!session || !canAccessStore(session, store)) {
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({ session });
}

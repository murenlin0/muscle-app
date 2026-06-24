import { NextResponse } from 'next/server';
import { getClientBalanceFromLedger, listClients } from '@/lib/clients-server';
import { portalJson, requireClientsAccess } from '@/lib/portal-api';
import type { StoreSlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeParam = url.searchParams.get('store') as StoreSlug | null;
  const phoneParam = url.searchParams.get('phone')?.trim();

  const access = await requireClientsAccess(storeParam);
  if (access instanceof NextResponse) return access;

  try {
    if (phoneParam) {
      const balance = await getClientBalanceFromLedger(access.storeId, phoneParam);
      return portalJson({ phone: phoneParam, balance: balance ?? 0, storeId: access.storeId });
    }

    const clients = await listClients(access.storeId);
    return portalJson({ clients, storeId: access.storeId });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入客人資料';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

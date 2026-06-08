import { NextResponse } from 'next/server';
import { getStore, isStoreSlug, type StoreSlug } from '@/lib/stores';

export function parseStoreFromParams(
  params: { store?: string } | Promise<{ store?: string }>,
): StoreSlug | NextResponse {
  const resolved = params instanceof Promise ? undefined : params.store;
  if (!resolved || !isStoreSlug(resolved) || !getStore(resolved)) {
    return NextResponse.json({ error: 'invalid store' }, { status: 404 });
  }
  return resolved;
}

export async function parseStoreFromParamsAsync(
  params: Promise<{ store?: string }>,
): Promise<StoreSlug | NextResponse> {
  const { store } = await params;
  if (!store || !isStoreSlug(store) || !getStore(store)) {
    return NextResponse.json({ error: 'invalid store' }, { status: 404 });
  }
  return store;
}

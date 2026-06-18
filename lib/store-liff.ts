import type { StoreSlug } from '@/lib/stores';

/** 各店官方 LINE 帳號各自建立 LIFF，Endpoint 指向 /{slug}/book */
export function getLiffIdForStore(slug: StoreSlug): string {
  const byStore: Record<StoreSlug, string | undefined> = {
    store1: process.env.NEXT_PUBLIC_LIFF_ID_STORE1,
    store2: process.env.NEXT_PUBLIC_LIFF_ID_STORE2,
  };
  return byStore[slug] ?? process.env.NEXT_PUBLIC_LIFF_ID ?? '';
}

/** 官方帳號 Basic ID（例 @440fmgpo），用於 oaMessage 預填；可覆寫 env */
export function getLineOaBasicIdForStore(slug: StoreSlug): string | null {
  const byStore: Record<StoreSlug, string | undefined> = {
    store1: process.env.NEXT_PUBLIC_LINE_OA_BASIC_ID_STORE1,
    store2: process.env.NEXT_PUBLIC_LINE_OA_BASIC_ID_STORE2,
  };
  const raw = byStore[slug]?.trim();
  if (!raw) return null;
  return raw.startsWith('@') ? raw : `@${raw}`;
}

'use client';

import { createContext, useContext, useMemo } from 'react';
import { getStoreOrThrow, storeBookPath, type StoreConfig, type StoreSlug } from '@/lib/stores';

interface StoreContextValue {
  store: StoreConfig;
  bookBase: string;
  apiBase: string;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({
  slug,
  children,
}: {
  slug: StoreSlug;
  children: React.ReactNode;
}) {
  const value = useMemo(() => {
    const store = getStoreOrThrow(slug);
    return {
      store,
      bookBase: storeBookPath(slug),
      apiBase: `/api/${slug}`,
    };
  }, [slug]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

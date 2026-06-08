import { notFound } from 'next/navigation';
import { LiffProvider } from '@/app/components/liff-provider';
import { StoreProvider } from '@/components/store-provider';
import { getStore, isStoreSlug, type StoreSlug } from '@/lib/stores';

export default async function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ store: string }>;
}) {
  const { store: storeParam } = await params;

  if (!isStoreSlug(storeParam)) notFound();
  const store = getStore(storeParam);
  if (!store || !store.bookingEnabled) notFound();

  return (
    <StoreProvider slug={storeParam as StoreSlug}>
      <LiffProvider>{children}</LiffProvider>
    </StoreProvider>
  );
}

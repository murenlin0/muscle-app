import { notFound } from 'next/navigation';
import { StoreProvider } from '@/components/store-provider';
import { getStore, isStoreSlug, type StoreSlug } from '@/lib/stores';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ store: string }>;
}) {
  const { store: storeParam } = await params;

  if (!isStoreSlug(storeParam)) notFound();
  const store = getStore(storeParam);
  if (!store) notFound();

  return <StoreProvider slug={storeParam as StoreSlug}>{children}</StoreProvider>;
}

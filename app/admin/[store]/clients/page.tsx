'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PortalShell } from '@/app/components/portal-shell';
import { ClientsPanel } from '@/components/portal/clients-panel';
import { useStore } from '@/components/store-provider';

const PORTAL_API = '/api/portal';

export default function SuperStoreClientsPage() {
  const router = useRouter();
  const { store } = useStore();
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const res = await fetch(`${PORTAL_API}/session`);
      const data = (await res.json()) as { session?: { role: string } | null };
      if (cancelled) return;
      if (!data.session || data.session.role !== 'super') {
        router.replace('/login');
        return;
      }
      setBootstrapping(false);
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (bootstrapping) {
    return (
      <PortalShell title={`${store.name} 客人資料庫`} variant="admin" size="lg" backHref="/admin">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title={`${store.name} 客人資料庫`}
      subtitle="總管理員"
      variant="admin"
      size="lg"
      backHref="/admin"
    >
      <ClientsPanel storeId={store.slug} />
    </PortalShell>
  );
}

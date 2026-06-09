'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { PortalShell } from '@/app/components/portal-shell';
import { ClientsPanel } from '@/components/portal/clients-panel';
import { Button } from '@/components/ui/button';
import { STORE_LIST, type StoreSlug } from '@/lib/stores';

const PORTAL_API = '/api/portal';

export default function SuperAdminClientsPage() {
  const router = useRouter();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [displayName, setDisplayName] = useState('總管理員');
  const [store, setStore] = useState<StoreSlug>('store1');

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const res = await fetch(`${PORTAL_API}/session`);
      const data = (await res.json()) as {
        session?: { role: string; displayName?: string } | null;
      };
      if (cancelled) return;
      if (!data.session || data.session.role !== 'super') {
        router.replace('/login');
        return;
      }
      if (data.session.displayName) setDisplayName(data.session.displayName);
      setBootstrapping(false);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await fetch(`${PORTAL_API}/logout`, { method: 'POST' });
    router.replace('/login');
  }

  if (bootstrapping) {
    return (
      <PortalShell title="客人資料庫" variant="admin" size="lg">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="客人資料庫"
      subtitle={displayName}
      variant="admin"
      size="lg"
      backHref="/admin"
      headerActions={
        <Button type="button" variant="ghost" size="sm" onClick={() => void handleLogout()}>
          <LogOut className="mr-1.5 size-4" />
          登出
        </Button>
      }
    >
      <ClientsPanel
        storeId={store}
        showStorePicker
        storeOptions={STORE_LIST.map((s) => ({ slug: s.slug, name: s.name }))}
        onStoreChange={setStore}
      />
    </PortalShell>
  );
}

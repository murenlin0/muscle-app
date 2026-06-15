'use client';

import { PortalShell } from '@/app/components/portal-shell';
import { ClientsPanel } from '@/components/portal/clients-panel';
import { useStoreAdminGuard } from '@/components/portal/use-portal-guard';
import { useStore } from '@/components/store-provider';

export default function ManagerClientsPage() {
  const { store } = useStore();
  const managerBase = `/manager/${store.slug}`;
  const { loading: bootstrapping } = useStoreAdminGuard(store.slug);

  if (bootstrapping) {
    return (
      <PortalShell title="客人資料庫" variant="admin" size="lg" backHref={managerBase}>
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="客人資料庫"
      subtitle={store.name}
      variant="admin"
      size="lg"
      backHref={managerBase}
    >
      <ClientsPanel storeId={store.slug} />
    </PortalShell>
  );
}

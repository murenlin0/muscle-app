'use client';

import { PortalShell } from '@/app/components/portal-shell';
import { TeamManagement } from '@/components/portal/team-management';
import { useStoreAdminGuard } from '@/components/portal/use-portal-guard';
import { useStore } from '@/components/store-provider';

export default function StoreTeamPage() {
  const { store, adminBase } = useStore();
  const { loading } = useStoreAdminGuard(store.slug);

  if (loading) {
    return (
      <PortalShell title="人員與權限" variant="admin" size="xl" backHref={adminBase}>
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="人員與權限"
      subtitle={store.name}
      variant="admin"
      size="xl"
      backHref={adminBase}
    >
      <TeamManagement storeFilter={store.slug} />
    </PortalShell>
  );
}

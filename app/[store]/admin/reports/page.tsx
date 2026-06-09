'use client';

import { PortalShell } from '@/app/components/portal-shell';
import { ReportsDashboard } from '@/components/portal/reports-dashboard';
import { useStoreAdminGuard } from '@/components/portal/use-portal-guard';
import { useStore } from '@/components/store-provider';

export default function StoreReportsPage() {
  const { store, adminBase } = useStore();
  const { loading: bootstrapping } = useStoreAdminGuard(store.slug);

  if (bootstrapping) {
    return (
      <PortalShell title="本店報表" variant="admin" size="lg" backHref={adminBase}>
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="本店報表"
      subtitle={store.name}
      variant="admin"
      size="lg"
      backHref={adminBase}
    >
      <ReportsDashboard storeFilter={store.slug} />
    </PortalShell>
  );
}

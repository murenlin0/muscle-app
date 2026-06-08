'use client';

import { PortalShell } from '@/app/components/portal-shell';
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
      <div className="glass-card p-6 text-sm text-muted-foreground">
        <p>報表將在 Google Calendar webhook 同步結帳資料後顯示。</p>
        <ul className="mt-4 list-disc space-y-1 pl-5">
          <li>日營收與付款方式</li>
          <li>師傅業績與抽成</li>
          <li>月結報表</li>
        </ul>
      </div>
    </PortalShell>
  );
}

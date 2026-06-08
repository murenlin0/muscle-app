'use client';

import { PortalShell } from '@/app/components/portal-shell';
import { useStoreAdminGuard } from '@/components/portal/use-portal-guard';
import { useStore } from '@/components/store-provider';

export default function StoreTeamPage() {
  const { store, adminBase } = useStore();
  const { loading: bootstrapping } = useStoreAdminGuard(store.slug);

  if (bootstrapping) {
    return (
      <PortalShell title="師傅管理" variant="admin" size="lg" backHref={adminBase}>
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="師傅管理"
      subtitle={store.name}
      variant="admin"
      size="lg"
      backHref={adminBase}
    >
      <div className="glass-card p-6 text-sm text-muted-foreground">
        <p>店長可在此新增／停用本店師傅、重設 PIN（下一版上線）。</p>
        <p className="mt-4">
          目前請在 Supabase <code className="text-foreground">staff</code> 表維護，並確保{' '}
          <code className="text-foreground">store_id = {store.slug}</code>。
        </p>
      </div>
    </PortalShell>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { BarChart3, FileSpreadsheet, LogOut, Users } from 'lucide-react';
import { PortalShell } from '@/app/components/portal-shell';
import { AdminHubCard } from '@/components/portal/admin-hub-card';
import { portalLogout, useStoreAdminGuard } from '@/components/portal/use-portal-guard';
import { useStore } from '@/components/store-provider';
import { Button } from '@/components/ui/button';

export default function AdminHubPage() {
  const router = useRouter();
  const { store, adminBase } = useStore();
  const { session, loading: bootstrapping } = useStoreAdminGuard(store.slug);

  const subtitle =
    session?.role === 'store'
      ? session.displayName
      : session?.role === 'super'
        ? `總管理 · ${store.name}`
        : store.name;

  if (bootstrapping) {
    return (
      <PortalShell title="管理後台" subtitle={store.name} variant="admin" size="lg">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="管理後台"
      subtitle={subtitle}
      variant="admin"
      size="lg"
      headerActions={
        <Button type="button" variant="ghost" size="sm" onClick={() => void portalLogout(router)}>
          <LogOut className="mr-1.5 size-4" />
          登出
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminHubCard
          href={`${adminBase}/import`}
          icon={FileSpreadsheet}
          title="會員 CSV 匯入"
          description="從 Notion 匯出餘額表，更新本店會員"
        />
        <AdminHubCard
          href={`${adminBase}/reports`}
          icon={BarChart3}
          title="本店報表"
          description="日營收、師傅業績（待 GCal 同步）"
        />
        <AdminHubCard
          href={`${adminBase}/team`}
          icon={Users}
          title="師傅管理"
          description="本店師傅名單與 PIN（即將上線）"
        />
      </div>
    </PortalShell>
  );
}

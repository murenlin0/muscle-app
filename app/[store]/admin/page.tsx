'use client';

import { useRouter } from 'next/navigation';
import { BarChart3, Contact, FileSpreadsheet, LogOut, Users } from 'lucide-react';
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
          title="人員與權限"
          description="師傅 PIN、店長權限與啟用狀態"
        />
        <AdminHubCard
          href={`${adminBase}/clients`}
          icon={Contact}
          title="客人資料庫"
          description="會員餘額與消費紀錄"
        />
      </div>
    </PortalShell>
  );
}

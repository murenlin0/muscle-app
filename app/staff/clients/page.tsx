'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { PortalShell } from '@/app/components/portal-shell';
import { ClientsPanel } from '@/components/portal/clients-panel';
import { portalLogout, usePortalGuard } from '@/components/portal/use-portal-guard';
import { Button } from '@/components/ui/button';
export default function StaffClientsPage() {
  const router = useRouter();
  const { session, loading: bootstrapping } = usePortalGuard('staff');

  const staffName = session?.role === 'staff' ? session.staffName : '';

  if (bootstrapping) {
    return (
      <PortalShell title="客人資料庫" variant="staff" size="lg" backHref="/staff">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="客人資料庫"
      subtitle={staffName}
      variant="staff"
      size="lg"
      backHref="/staff"
      headerActions={
        <Button type="button" variant="ghost" size="sm" onClick={() => void portalLogout(router)}>
          <LogOut className="mr-1.5 size-4" />
          登出
        </Button>
      }
    >
      <ClientsPanel />
    </PortalShell>
  );
}

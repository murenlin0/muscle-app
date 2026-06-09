'use client';

import { PortalShell } from '@/app/components/portal-shell';
import { TeamManagement } from '@/components/portal/team-management';
import { usePortalGuard } from '@/components/portal/use-portal-guard';

export default function SuperTeamPage() {
  const { loading } = usePortalGuard('super');

  if (loading) {
    return (
      <PortalShell title="人員與權限" variant="admin" size="xl" backHref="/admin">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="人員與權限"
      subtitle="全店師傅 · PIN 與店長權限"
      variant="admin"
      size="xl"
      backHref="/admin"
    >
      <TeamManagement showStoreColumn allowPickStore />
    </PortalShell>
  );
}

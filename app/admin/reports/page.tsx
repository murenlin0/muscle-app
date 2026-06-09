'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PortalShell } from '@/app/components/portal-shell';
import { ReportsDashboard } from '@/components/portal/reports-dashboard';

const PORTAL_API = '/api/portal';

export default function SuperReportsPage() {
  const router = useRouter();
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const res = await fetch(`${PORTAL_API}/session`);
      const data = (await res.json()) as { session?: { role: string } | null };
      if (cancelled) return;
      if (!data.session || data.session.role === 'staff') {
        router.replace('/login');
        return;
      }
      if (data.session.role !== 'super') {
        router.replace('/login');
        return;
      }
      setBootstrapping(false);
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (bootstrapping) {
    return (
      <PortalShell title="全店報表" variant="admin" size="full" backHref="/admin">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="全店報表" subtitle="總管理員" variant="admin" size="full" backHref="/admin">
      <ReportsDashboard showStorePicker />
    </PortalShell>
  );
}

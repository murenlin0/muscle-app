'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PortalShell } from '@/app/components/portal-shell';
import { STORE_LIST } from '@/lib/stores';

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
      <PortalShell title="全店報表" variant="admin" size="lg" backHref="/admin">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="全店報表" subtitle="總管理員" variant="admin" size="lg" backHref="/admin">
      <div className="glass-card space-y-4 p-6 text-sm text-muted-foreground">
        <p>報表將在 Google Calendar webhook 同步結帳資料後顯示。</p>
        <ul className="list-disc space-y-1 pl-5">
          {STORE_LIST.map((s) => (
            <li key={s.slug}>{s.name}：日營收、師傅業績、月結</li>
          ))}
          <li>跨店彙總與股東分潤</li>
        </ul>
      </div>
    </PortalShell>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { PortalShell } from '@/app/components/portal-shell';
import { AdminHubCard } from '@/components/portal/admin-hub-card';
import { STORE_LIST } from '@/lib/stores';

const PORTAL_API = '/api/portal';

export default function AdminReportsIndexPage() {
  const router = useRouter();
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const res = await fetch(`${PORTAL_API}/session`);
      const data = (await res.json()) as { session?: { role: string } | null };
      if (cancelled) return;
      if (!data.session || data.session.role !== 'super') {
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
      <PortalShell title="報表" variant="admin" size="lg" backHref="/admin">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="報表" subtitle="選擇分店" variant="admin" size="lg" backHref="/admin">
      <div className="grid gap-4 sm:grid-cols-2">
        {STORE_LIST.map((store) => (
          <AdminHubCard
            key={store.slug}
            href={`/admin/${store.slug}/reports`}
            icon={BarChart3}
            title={store.name}
            description={store.area}
          />
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        各連結可直接書籤儲存：
        {STORE_LIST.map((s, i) => (
          <span key={s.slug}>
            {i > 0 ? ' · ' : ' '}
            <Link href={`/admin/${s.slug}/reports`} className="text-primary hover:underline">
              {s.name}
            </Link>
          </span>
        ))}
      </p>
    </PortalShell>
  );
}

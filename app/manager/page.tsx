'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { PortalShell } from '@/app/components/portal-shell';
import { AdminHubCard } from '@/components/portal/admin-hub-card';
import { STORE_LIST } from '@/lib/stores';

const PORTAL_API = '/api/portal';

type Session = { role: string; storeIds?: string[]; storeId?: string; displayName?: string };

export default function ManagerHubPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const res = await fetch(`${PORTAL_API}/session`);
      const data = (await res.json()) as { session?: Session | null };
      if (cancelled) return;
      const s = data.session;
      if (!s || s.role === 'staff') {
        router.replace('/login');
        return;
      }
      if (s.role === 'super') {
        router.replace('/admin');
        return;
      }
      if (s.role === 'store') {
        const ids = s.storeIds ?? (s.storeId ? [s.storeId] : []);
        if (ids.length === 0) {
          router.replace('/login');
          return;
        }
      }
      setSession(s);
      setBootstrapping(false);
    }
    void check();
    return () => { cancelled = true; };
  }, [router]);

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">載入中…</p>
      </div>
    );
  }

  const assignedIds = session?.storeIds ?? (session?.storeId ? [session.storeId] : []);
  const assignedStores = STORE_LIST.filter((s) => assignedIds.includes(s.slug));

  return (
    <PortalShell
      title="管理後台"
      subtitle={session?.displayName ?? '店長'}
      variant="admin"
      size="md"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {assignedStores.map((store) => (
          <AdminHubCard
            key={store.slug}
            href={`/manager/${store.slug}`}
            icon={Building2}
            title={store.name}
            description={store.area ?? ''}
          />
        ))}
      </div>
    </PortalShell>
  );
}

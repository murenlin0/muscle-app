'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PortalRole, PortalSession } from '@/lib/portal-session';

const PORTAL_API = '/api/portal';

export function usePortalGuard(allowed: PortalRole | PortalRole[], loginPath = '/login') {
  const router = useRouter();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const res = await fetch(`${PORTAL_API}/session`);
      const data = (await res.json()) as { session?: PortalSession | null };
      if (cancelled) return;

      const roles = Array.isArray(allowed) ? allowed : [allowed];
      if (!data.session || !roles.includes(data.session.role)) {
        router.replace(loginPath);
        return;
      }

      setSession(data.session);
      setLoading(false);
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [allowed, loginPath, router]);

  return { session, loading };
}

export async function portalLogout(router: { replace: (path: string) => void }) {
  await fetch(`${PORTAL_API}/logout`, { method: 'POST' });
  router.replace('/login');
}

export function useStoreAdminGuard(storeSlug: string, loginPath = '/login') {
  const router = useRouter();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const res = await fetch(`${PORTAL_API}/session`);
      const data = (await res.json()) as { session?: PortalSession | null };
      if (cancelled) return;

      const s = data.session;
      if (!s || s.role === 'staff') {
        router.replace(loginPath);
        return;
      }
      if (s.role === 'store' && s.storeId !== storeSlug) {
        router.replace(loginPath);
        return;
      }

      setSession(s);
      setLoading(false);
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [loginPath, router, storeSlug]);

  return { session, loading };
}

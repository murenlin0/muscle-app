'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Contact,
  FileSpreadsheet,
  LogOut,
  Users,
} from 'lucide-react';
import { PortalShell } from '@/app/components/portal-shell';
import { AdminHubCard } from '@/components/portal/admin-hub-card';
import { Button } from '@/components/ui/button';
import { STORE_LIST } from '@/lib/stores';

const PORTAL_API = '/api/portal';

export default function SuperAdminPage() {
  const router = useRouter();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [displayName, setDisplayName] = useState('總管理員');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const res = await fetch(`${PORTAL_API}/session`);
      const data = (await res.json()) as {
        session?: { role: string; displayName?: string } | null;
        home?: string;
      };
      if (cancelled) return;
      if (!data.session || data.session.role !== 'super') {
        router.replace('/login');
        return;
      }
      if (data.session.displayName) setDisplayName(data.session.displayName);
      setBootstrapping(false);
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await fetch(`${PORTAL_API}/logout`, { method: 'POST' });
    router.replace('/login');
  }

  if (bootstrapping) {
    return (
      <PortalShell title="總管理後台" variant="admin" size="lg">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="總管理後台"
      subtitle={displayName}
      variant="admin"
      size="lg"
      headerActions={
        <Button type="button" variant="ghost" size="sm" onClick={() => void handleLogout()}>
          <LogOut className="mr-1.5 size-4" />
          登出
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminHubCard
          href="/admin/team"
          icon={Users}
          title="人員與權限"
          description="指派店長帳號、管理各店師傅"
        />
        <AdminHubCard
          href="/admin/google"
          icon={CalendarDays}
          title="Google 日曆"
          description="OAuth 授權與 refresh token 設定"
        />
        <AdminHubCard
          href="/admin/reports"
          icon={BarChart3}
          title="全店報表"
          description="民有、文一及跨店彙總（待 GCal 同步後上線）"
        />
        <AdminHubCard
          href="/admin/clients"
          icon={Contact}
          title="客人資料庫"
          description="各店會員餘額與消費紀錄"
        />
        {STORE_LIST.map((store) => (
          <AdminHubCard
            key={store.slug}
            href={`/${store.slug}/admin/import`}
            icon={FileSpreadsheet}
            title={`${store.name} · 會員匯入`}
            description="Notion CSV 匯入該店會員"
          />
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        各店店長入口：
        {STORE_LIST.map((s, i) => (
          <span key={s.slug}>
            {i > 0 ? ' · ' : ' '}
            <Link href={`/${s.slug}/admin`} className="text-primary hover:underline">
              {s.name}
            </Link>
          </span>
        ))}
      </p>
    </PortalShell>
  );
}

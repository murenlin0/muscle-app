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
import { AdminHubLink, AdminHubSection } from '@/components/portal/admin-hub-section';
import { Button } from '@/components/ui/button';
import { STORE_LIST, type StoreConfig } from '@/lib/stores';

const PORTAL_API = '/api/portal';

function StoreHubPanel({ store }: { store: StoreConfig }) {
  return (
    <AdminHubSection title={store.name} description={store.area}>
      <AdminHubLink
        href={`/admin/${store.slug}/reports`}
        icon={BarChart3}
        title="報表"
        description="日營收、師傅業績與流水帳"
      />
      <AdminHubLink
        href={`/admin/${store.slug}/clients`}
        icon={Contact}
        title="客人資料庫"
        description="本店會員餘額與消費紀錄"
      />
      <AdminHubLink
        href={`/manager/${store.slug}/import`}
        icon={FileSpreadsheet}
        title="會員匯入"
        description="Notion CSV 匯入本店會員"
      />
    </AdminHubSection>
  );
}

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
      <PortalShell title="總管理後台" variant="admin" size="xl">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="總管理後台"
      subtitle={displayName}
      variant="admin"
      size="xl"
      headerActions={
        <Button type="button" variant="ghost" size="sm" onClick={() => void handleLogout()}>
          <LogOut className="mr-1.5 size-4" />
          登出
        </Button>
      }
    >
      <div className="space-y-8">
        <AdminHubSection title="全店設定" description="跨分店共用功能">
          <AdminHubLink
            href="/admin/team"
            icon={Users}
            title="人員與權限"
            description="指派店長帳號、管理各店師傅"
          />
          <AdminHubLink
            href="/admin/google"
            icon={CalendarDays}
            title="Google 日曆"
            description="OAuth 授權與 refresh token 設定"
          />
        </AdminHubSection>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            分店資料
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {STORE_LIST.map((store) => (
              <StoreHubPanel key={store.slug} store={store} />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        各店店長入口：
        {STORE_LIST.map((s, i) => (
          <span key={s.slug}>
            {i > 0 ? ' · ' : ' '}
            <Link href={`/manager/${s.slug}`} className="text-primary hover:underline">
              {s.name}
            </Link>
          </span>
        ))}
      </p>
    </PortalShell>
  );
}

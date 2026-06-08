'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PortalShell } from '@/app/components/portal-shell';
import { StatusBanner } from '@/components/portal/status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STORE_LIST } from '@/lib/stores';

const PORTAL_API = '/api/portal';

interface PortalAccount {
  id: string;
  role: string;
  store_id: string | null;
  display_name: string;
  is_active: boolean;
}

export default function SuperTeamPage() {
  const router = useRouter();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [storeId, setStoreId] = useState('store1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadAccounts() {
    const res = await fetch('/api/portal/admins');
    const data = (await res.json()) as { accounts?: PortalAccount[]; error?: string };
    if (res.ok) setAccounts(data.accounts ?? []);
    else setError(data.error ?? '無法載入');
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const sessionRes = await fetch(`${PORTAL_API}/session`);
      const sessionData = (await sessionRes.json()) as {
        session?: { role: string } | null;
      };
      if (cancelled) return;
      if (!sessionData.session || sessionData.session.role !== 'super') {
        router.replace('/login');
        return;
      }
      await loadAccounts();
      if (!cancelled) setBootstrapping(false);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await fetch('/api/portal/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, displayName, password }),
    });
    const data = (await res.json()) as { error?: string };

    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '建立失敗');
      return;
    }

    setSuccess(`已建立店長：${displayName}`);
    setDisplayName('');
    setPassword('');
    await loadAccounts();
  }

  if (bootstrapping) {
    return (
      <PortalShell title="人員與權限" variant="admin" size="lg" backHref="/admin">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="人員與權限" subtitle="指派店長" variant="admin" size="lg" backHref="/admin">
      <div className="glass-card mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold">新增店長帳號</h2>
        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="store">分店</Label>
            <select
              id="store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-input px-3 text-sm"
            >
              {STORE_LIST.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">顯示名稱</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如：民有店長"
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pw">登入密碼</Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="sm:col-span-2">
            {loading ? '建立中…' : '建立店長帳號'}
          </Button>
        </form>
      </div>

      {error ? <StatusBanner variant="error">{error}</StatusBanner> : null}
      {success ? (
        <div className="mb-4">
          <StatusBanner variant="success">{success}</StatusBanner>
        </div>
      ) : null}

      <div className="glass-card p-6">
        <h2 className="mb-4 text-sm font-semibold">現有店長帳號</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            尚無資料庫帳號。可用環境變數 STORE_ADMIN_SECRET 作為過渡密碼，或先執行
            09_portal_accounts.sql。
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
              >
                <span>
                  {a.display_name}
                  <span className="ml-2 text-muted-foreground">
                    · {STORE_LIST.find((s) => s.slug === a.store_id)?.name ?? a.store_id}
                  </span>
                </span>
                <span className={a.is_active ? 'text-primary' : 'text-muted-foreground'}>
                  {a.is_active ? '啟用' : '停用'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        師傅名單在 Supabase staff 表；各店店長可在店內後台管理本店師傅（即將上線）。
      </p>
    </PortalShell>
  );
}

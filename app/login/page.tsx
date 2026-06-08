'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KeyRound, Shield, Users } from 'lucide-react';
import { PortalShell } from '@/app/components/portal-shell';
import { StatusBanner } from '@/components/portal/status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STORE_LIST } from '@/lib/stores';
import { cn } from '@/lib/utils';

const PORTAL_API = '/api/portal';

type LoginMode = 'staff' | 'store' | 'super';

interface StaffOption {
  id: string;
  display_name: string;
  store_name: string;
}

const MODES: { id: LoginMode; label: string; icon: typeof Users }[] = [
  { id: 'staff', label: '師傅', icon: Users },
  { id: 'store', label: '店長', icon: KeyRound },
  { id: 'super', label: '總管理', icon: Shield },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('staff');
  const [roster, setRoster] = useState<StaffOption[]>([]);
  const [staffId, setStaffId] = useState('');
  const [storeId, setStoreId] = useState('store1');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const sessionRes = await fetch(`${PORTAL_API}/session`);
      const sessionData = (await sessionRes.json()) as { home?: string };
      if (!cancelled && sessionData.home) {
        router.replace(sessionData.home);
        return;
      }

      const rosterRes = await fetch('/api/staff/roster');
      const rosterData = (await rosterRes.json()) as {
        staff?: StaffOption[];
      };
      if (!cancelled) {
        setRoster(rosterData.staff ?? []);
        setBootstrapping(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body =
      mode === 'staff'
        ? { mode, staffId, pin }
        : mode === 'store'
          ? { mode, storeId, password }
          : { mode, password };

    const res = await fetch(`${PORTAL_API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string; redirect?: string };

    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '登入失敗');
      return;
    }

    router.replace(data.redirect ?? '/');
  }

  return (
    <PortalShell title="筋棧登入" subtitle="師傅 · 店長 · 總管理" size="lg">
      <div className="mb-6 flex rounded-lg border border-primary/20 bg-card/40 p-1">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMode(m.id);
                setError(null);
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                mode === m.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="glass-card p-6">
        {bootstrapping ? (
          <p className="text-center text-sm text-muted-foreground">載入中…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'staff' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="staff">師傅</Label>
                  <select
                    id="staff"
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value)}
                    required
                    className="input-neon flex h-11 w-full rounded-lg border border-input bg-input px-3 text-sm"
                  >
                    <option value="">請選擇</option>
                    {roster.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.display_name} · {s.store_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pin">店內 PIN</Label>
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="input-neon h-11"
                    required
                  />
                </div>
              </>
            ) : null}

            {mode === 'store' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="store">分店</Label>
                  <select
                    id="store"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="input-neon flex h-11 w-full rounded-lg border border-input bg-input px-3 text-sm"
                  >
                    {STORE_LIST.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store-password">店長密碼</Label>
                  <Input
                    id="store-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-neon h-11"
                    required
                  />
                </div>
              </>
            ) : null}

            {mode === 'super' ? (
              <div className="space-y-2">
                <Label htmlFor="super-password">總管理密碼</Label>
                <Input
                  id="super-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-neon h-11"
                  required
                />
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-11 w-full shadow-md shadow-primary/20"
              disabled={loading || (mode === 'staff' && !staffId)}
            >
              {loading ? '登入中…' : '登入'}
            </Button>
          </form>
        )}
      </div>

      {error ? (
        <div className="mt-4">
          <StatusBanner variant="error">{error}</StatusBanner>
        </div>
      ) : null}

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        {mode === 'staff'
          ? '師傅登入後可貼 LINE 訊息建預約，無法查看報表。'
          : mode === 'store'
            ? '店長可管理本店師傅與查看本店報表。'
            : '總管理可指派店長、管理全店師傅與查看所有報表。'}
      </p>
    </PortalShell>
  );
}

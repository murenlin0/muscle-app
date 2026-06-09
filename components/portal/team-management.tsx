'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusBanner } from '@/components/portal/status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STORE_LIST, type StoreSlug } from '@/lib/stores';

export interface TeamMemberRow {
  staffId: string;
  displayName: string;
  storeId: StoreSlug;
  storeName: string;
  isActive: boolean;
  permissions: ('staff' | 'store_admin')[];
  staffPin: string | null;
  adminPassword: string | null;
  portalAccountId: string | null;
}

interface MemberDraft {
  displayName: string;
  staffPin: string;
  adminPassword: string;
  isStaff: boolean;
  isStoreAdmin: boolean;
  isActive: boolean;
}

function draftFromMember(m: TeamMemberRow): MemberDraft {
  return {
    displayName: m.displayName,
    staffPin: m.staffPin ?? '',
    adminPassword: m.adminPassword ?? '',
    isStaff: m.permissions.includes('staff'),
    isStoreAdmin: m.permissions.includes('store_admin'),
    isActive: m.isActive,
  };
}

export function TeamManagement({
  storeFilter,
  showStoreColumn = false,
  allowPickStore = false,
}: {
  storeFilter?: StoreSlug;
  showStoreColumn?: boolean;
  allowPickStore?: boolean;
}) {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newAdminPw, setNewAdminPw] = useState('');
  const [newStore, setNewStore] = useState<StoreSlug>(storeFilter ?? 'store1');
  const [newIsStoreAdmin, setNewIsStoreAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = storeFilter ? `?store=${storeFilter}` : '';
    const res = await fetch(`/api/portal/team${qs}`);
    const data = (await res.json()) as { members?: TeamMemberRow[]; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '無法載入');
      return;
    }
    const rows = data.members ?? [];
    setMembers(rows);
    setDrafts(Object.fromEntries(rows.map((m) => [m.staffId, draftFromMember(m)])));
  }, [storeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMember(staffId: string) {
    const draft = drafts[staffId];
    if (!draft) return;

    setSavingId(staffId);
    setError(null);
    setSuccess(null);

    const permissions: ('staff' | 'store_admin')[] = [];
    if (draft.isStaff) permissions.push('staff');
    if (draft.isStoreAdmin) permissions.push('store_admin');

    const res = await fetch(`/api/portal/team/${staffId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: draft.displayName,
        isActive: draft.isActive,
        staffPin: draft.staffPin || undefined,
        adminPassword: draft.adminPassword || undefined,
        permissions,
      }),
    });
    const data = (await res.json()) as { error?: string };

    setSavingId(null);
    if (!res.ok) {
      setError(data.error ?? '儲存失敗');
      return;
    }

    setSuccess(`已更新：${draft.displayName}`);
    await load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    const permissions: ('staff' | 'store_admin')[] = ['staff'];
    if (newIsStoreAdmin) permissions.push('store_admin');

    const res = await fetch('/api/portal/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: allowPickStore ? newStore : storeFilter,
        displayName: newName,
        staffPin: newPin,
        adminPassword: newAdminPw || undefined,
        permissions,
      }),
    });
    const data = (await res.json()) as { error?: string };

    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? '新增失敗');
      return;
    }

    setSuccess(`已新增：${newName}`);
    setNewName('');
    setNewPin('');
    setNewAdminPw('');
    setNewIsStoreAdmin(false);
    await load();
  }

  if (loading) {
    return <p className="text-center text-sm text-muted-foreground">載入中…</p>;
  }

  return (
    <div className="space-y-6">
      {error ? <StatusBanner variant="error">{error}</StatusBanner> : null}
      {success ? <StatusBanner variant="success">{success}</StatusBanner> : null}

      <div className="glass-card overflow-x-auto p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold">師傅與權限</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無師傅資料，請用下方表單新增。</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th className="pb-3 pr-3 font-medium">姓名</th>
                {showStoreColumn ? <th className="pb-3 pr-3 font-medium">分店</th> : null}
                <th className="pb-3 pr-3 font-medium">師傅 PIN</th>
                <th className="pb-3 pr-3 font-medium">管理密碼</th>
                <th className="pb-3 pr-3 font-medium">權限</th>
                <th className="pb-3 pr-3 font-medium">狀態</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {members.map((m) => {
                const draft = drafts[m.staffId];
                if (!draft) return null;
                return (
                  <tr key={m.staffId} className="align-top">
                    <td className="py-3 pr-3">
                      <Input
                        value={draft.displayName}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [m.staffId]: { ...draft, displayName: e.target.value },
                          }))
                        }
                        className="h-9 min-w-[4rem]"
                      />
                    </td>
                    {showStoreColumn ? (
                      <td className="py-3 pr-3 text-muted-foreground">{m.storeName}</td>
                    ) : null}
                    <td className="py-3 pr-3">
                      <Input
                        value={draft.staffPin}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [m.staffId]: { ...draft, staffPin: e.target.value },
                          }))
                        }
                        placeholder="PIN"
                        className="h-9 w-24"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Input
                        type="text"
                        value={draft.adminPassword}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [m.staffId]: { ...draft, adminPassword: e.target.value },
                          }))
                        }
                        placeholder={draft.isStoreAdmin ? '店長密碼' : '—'}
                        disabled={!draft.isStoreAdmin}
                        className="h-9 w-28"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-col gap-1.5 text-xs">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.isStaff}
                            disabled
                            readOnly
                          />
                          師傅
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.isStoreAdmin}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [m.staffId]: { ...draft, isStoreAdmin: e.target.checked },
                              }))
                            }
                          />
                          店長
                        </label>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        value={draft.isActive ? 'active' : 'inactive'}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [m.staffId]: { ...draft, isActive: e.target.value === 'active' },
                          }))
                        }
                        className="h-9 rounded-md border border-input bg-input px-2 text-xs"
                      >
                        <option value="active">啟用</option>
                        <option value="inactive">停用</option>
                      </select>
                    </td>
                    <td className="py-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingId === m.staffId}
                        onClick={() => void saveMember(m.staffId)}
                      >
                        {savingId === m.staffId ? '儲存中…' : '儲存'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="glass-card p-6">
        <h2 className="mb-4 text-sm font-semibold">新增師傅</h2>
        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
          {allowPickStore ? (
            <div className="space-y-2">
              <Label>分店</Label>
              <select
                value={newStore}
                onChange={(e) => setNewStore(e.target.value as StoreSlug)}
                className="flex h-10 w-full rounded-md border border-input bg-input px-3 text-sm"
              >
                {STORE_LIST.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>姓名</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>師傅 PIN</Label>
            <Input value={newPin} onChange={(e) => setNewPin(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>管理密碼（店長才需要）</Label>
            <Input
              value={newAdminPw}
              onChange={(e) => setNewAdminPw(e.target.value)}
              disabled={!newIsStoreAdmin}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="new-store-admin"
              type="checkbox"
              checked={newIsStoreAdmin}
              onChange={(e) => setNewIsStoreAdmin(e.target.checked)}
            />
            <Label htmlFor="new-store-admin">同時具備店長權限</Label>
          </div>
          <Button type="submit" disabled={creating} className="sm:col-span-2">
            {creating ? '新增中…' : '新增師傅'}
          </Button>
        </form>
      </div>

      <p className="text-xs text-muted-foreground">
        總管理密碼仍由環境變數 SUPER_ADMIN_SECRET 控制。師傅 PIN／店長密碼儲存後會顯示於此表（僅管理後台可見）。
      </p>
    </div>
  );
}

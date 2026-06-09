'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusBanner } from '@/components/portal/status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accessLevelLabel, type AccessLevel } from '@/lib/team-server';
import { STORE_LIST, type StoreSlug } from '@/lib/stores';
import { cn } from '@/lib/utils';

export interface TeamMemberRow {
  staffId: string;
  displayName: string;
  storeId: StoreSlug;
  storeName: string;
  accessLevel: AccessLevel;
  staffPin: string;
  adminPassword: string | null;
}

interface MemberDraft {
  displayName: string;
  staffPin: string;
  adminPassword: string;
  accessLevel: AccessLevel;
}

function draftFromMember(m: TeamMemberRow): MemberDraft {
  return {
    displayName: m.displayName,
    staffPin: m.staffPin ?? '',
    adminPassword: m.adminPassword ?? '',
    accessLevel: m.accessLevel,
  };
}

const ACCESS_BADGE: Record<AccessLevel, string> = {
  none: 'bg-muted text-muted-foreground',
  staff: 'bg-primary/15 text-primary',
  store_admin: 'bg-accent/15 text-accent',
};

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
  const [canAssignStoreAdmin, setCanAssignStoreAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newAdminPw, setNewAdminPw] = useState('');
  const [newStore, setNewStore] = useState<StoreSlug>(storeFilter ?? 'store1');
  const [newAccessLevel, setNewAccessLevel] = useState<AccessLevel>('staff');
  const [creating, setCreating] = useState(false);

  const accessOptions: AccessLevel[] = canAssignStoreAdmin
    ? ['none', 'staff', 'store_admin']
    : ['none', 'staff'];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = storeFilter ? `?store=${storeFilter}` : '';
    const res = await fetch(`/api/portal/team${qs}`);
    const data = (await res.json()) as {
      members?: TeamMemberRow[];
      canAssignStoreAdmin?: boolean;
      error?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '無法載入');
      return;
    }
    const rows = data.members ?? [];
    setCanAssignStoreAdmin(Boolean(data.canAssignStoreAdmin));
    setMembers(rows);
    setDrafts(Object.fromEntries(rows.map((m) => [m.staffId, draftFromMember(m)])));
  }, [storeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAll() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const updates = members.map((m) => {
      const draft = drafts[m.staffId];
      return {
        staffId: m.staffId,
        displayName: draft.displayName,
        staffPin: draft.staffPin || undefined,
        adminPassword: draft.adminPassword || undefined,
        accessLevel: draft.accessLevel,
      };
    });

    const res = await fetch('/api/portal/team', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    const data = (await res.json()) as { error?: string };

    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? '儲存失敗');
      return;
    }

    setSuccess('已儲存全部人員設定');
    await load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    const res = await fetch('/api/portal/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: allowPickStore ? newStore : storeFilter,
        displayName: newName,
        staffPin: newPin,
        adminPassword: newAdminPw || undefined,
        accessLevel: newAccessLevel,
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
    setNewAccessLevel('staff');
    await load();
  }

  function permissionSelectDisabled(member: TeamMemberRow): boolean {
    if (canAssignStoreAdmin) return false;
    return member.accessLevel === 'store_admin';
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
          <>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs text-muted-foreground">
                  <th className="pb-3 pr-3 font-medium">姓名</th>
                  {showStoreColumn ? <th className="pb-3 pr-3 font-medium">分店</th> : null}
                  <th className="pb-3 pr-3 font-medium">目前權限</th>
                  <th className="pb-3 pr-3 font-medium">師傅 PIN</th>
                  <th className="pb-3 pr-3 font-medium">管理密碼</th>
                  <th className="pb-3 font-medium">調整權限</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {members.map((m) => {
                  const draft = drafts[m.staffId];
                  if (!draft) return null;
                  const permLocked = permissionSelectDisabled(m);
                  return (
                    <tr key={m.staffId} className="align-middle">
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
                        <span
                          className={cn(
                            'inline-flex rounded-md px-2 py-1 text-xs font-medium',
                            ACCESS_BADGE[m.accessLevel],
                          )}
                        >
                          {accessLevelLabel(m.accessLevel)}
                        </span>
                      </td>
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
                          disabled={draft.accessLevel === 'none'}
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <Input
                          value={draft.adminPassword}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [m.staffId]: { ...draft, adminPassword: e.target.value },
                            }))
                          }
                          placeholder={
                            draft.accessLevel === 'store_admin' ? '店長密碼' : '—'
                          }
                          disabled={draft.accessLevel !== 'store_admin'}
                          className="h-9 w-28"
                        />
                      </td>
                      <td className="py-3">
                        {permLocked ? (
                          <span className="text-xs text-muted-foreground">僅總管理可調整</span>
                        ) : (
                          <select
                            value={draft.accessLevel}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [m.staffId]: {
                                  ...draft,
                                  accessLevel: e.target.value as AccessLevel,
                                },
                              }))
                            }
                            className="h-9 rounded-md border border-input bg-input px-2 text-xs"
                          >
                            {accessOptions.map((level) => (
                              <option key={level} value={level}>
                                {accessLevelLabel(level)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-6 flex justify-end">
              <Button type="button" disabled={saving} onClick={() => void saveAll()}>
                {saving ? '儲存中…' : '儲存全部'}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="glass-card p-6">
        <h2 className="mb-4 text-sm font-semibold">新增人員</h2>
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
            <Label>權限</Label>
            <select
              value={newAccessLevel}
              onChange={(e) => setNewAccessLevel(e.target.value as AccessLevel)}
              className="flex h-10 w-full rounded-md border border-input bg-input px-3 text-sm"
            >
              {accessOptions
                .filter((l) => l !== 'none')
                .map((level) => (
                  <option key={level} value={level}>
                    {accessLevelLabel(level)}
                  </option>
                ))}
            </select>
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
              disabled={newAccessLevel !== 'store_admin'}
            />
          </div>
          <Button type="submit" disabled={creating} className="sm:col-span-2">
            {creating ? '新增中…' : '新增人員'}
          </Button>
        </form>
      </div>

      <p className="text-xs text-muted-foreground">
        {canAssignStoreAdmin
          ? '總管理可設：無權限、師傅、店長。店長僅可設：無權限、師傅。'
          : '店長僅可調整師傅 PIN 與無權限／師傅；已是店長者須由總管理變更權限。'}
      </p>
    </div>
  );
}

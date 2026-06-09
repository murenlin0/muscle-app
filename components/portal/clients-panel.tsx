'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClientListItem } from '@/lib/clients-server';
import type { StoreSlug } from '@/lib/stores';
import { cn } from '@/lib/utils';

function fmt(n: number) {
  return n.toLocaleString('zh-TW');
}

export function ClientsPanel({
  storeId: storeIdProp,
  showStorePicker = false,
  storeOptions,
  onStoreChange,
}: {
  storeId?: StoreSlug;
  showStorePicker?: boolean;
  storeOptions?: { slug: StoreSlug; name: string }[];
  onStoreChange?: (slug: StoreSlug) => void;
}) {
  const [storeId, setStoreId] = useState<StoreSlug>(storeIdProp ?? 'store1');
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (storeIdProp) setStoreId(storeIdProp);
  }, [storeIdProp]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (storeIdProp) qs.set('store', storeIdProp);
    const res = await fetch(`/api/portal/clients?${qs}`, { cache: 'no-store' });
    const data = (await res.json()) as {
      clients?: ClientListItem[];
      storeId?: StoreSlug;
      error?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '無法載入客人');
      setClients([]);
      return;
    }
    setClients(data.clients ?? []);
    if (data.storeId) setStoreId(data.storeId);
  }, [storeIdProp]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = clients.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      String(c.balance).includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {showStorePicker && storeOptions && onStoreChange ? (
          <div className="space-y-1">
            <label className="text-xs text-[#888]">分店</label>
            <select
              value={storeId}
              onChange={(e) => onStoreChange(e.target.value as StoreSlug)}
              className="flex h-9 rounded-md border border-[#444] bg-[#252525] px-2 text-sm"
            >
              {storeOptions.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="min-w-[12rem] flex-1 space-y-1">
          <label className="text-xs text-[#888]">搜尋姓名或電話</label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="姓名、電話…"
            className="flex h-9 w-full max-w-md rounded-md border border-[#444] bg-[#252525] px-3 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="h-9 rounded-md border border-[#444] bg-[#252525] px-3 text-sm text-[#ccc] hover:bg-[#333]"
        >
          {loading ? '載入中…' : '重新整理'}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-[#333] bg-[#1c1c1c]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#333] bg-[#252525] text-left text-[11px] font-medium tracking-wide text-[#8a8a8a]">
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2">電話</th>
              <th className="px-3 py-2 text-right">餘額</th>
              <th className="px-3 py-2">會員</th>
              <th className="px-3 py-2">狀態</th>
            </tr>
          </thead>
          <tbody>
            {loading && clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#888]">
                  載入中…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#888]">
                  {clients.length === 0 ? '尚無客人資料' : '沒有符合的結果'}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[#2a2a2a] transition hover:bg-[#262626]"
                >
                  <td className="px-3 py-2 text-[#ebebeb]">{c.name}</td>
                  <td className="px-3 py-2 tabular-nums text-[#bbb]">{c.phone}</td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right tabular-nums font-medium',
                      c.balance > 0 ? 'text-[#4fd1c5]' : 'text-[#888]',
                    )}
                  >
                    ${fmt(c.balance)}
                  </td>
                  <td className="px-3 py-2 text-[#bbb]">{c.isVip ? 'VIP' : '—'}</td>
                  <td className="px-3 py-2 text-[#bbb]">{c.isActive ? '啟用' : '停用'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[#666]">
        共 {fmt(filtered.length)} 位客人
        {query ? `（篩選自 ${fmt(clients.length)} 位）` : ''}。消費紀錄將與流水帳連動顯示。
      </p>
    </div>
  );
}

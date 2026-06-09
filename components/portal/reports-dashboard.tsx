'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusBanner } from '@/components/portal/status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STORE_LIST, type StoreSlug } from '@/lib/stores';

interface ReportSummary {
  from: string;
  to: string;
  storeId: StoreSlug | 'all';
  totalRevenue: number;
  transactionCount: number;
  byPayment: Record<string, number>;
  byStaff: Record<string, number>;
  byDay: { date: string; amount: number; count: number }[];
  latestRecordDate: string | null;
}

function fmt(n: number) {
  return n.toLocaleString('zh-TW');
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ReportsDashboard({
  storeFilter,
  showStorePicker = false,
  canSyncNotion = false,
}: {
  storeFilter?: StoreSlug;
  showStorePicker?: boolean;
  canSyncNotion?: boolean;
}) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [store, setStore] = useState<StoreSlug>(storeFilter ?? 'store1');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ from, to });
    if (showStorePicker) qs.set('store', store);
    else if (storeFilter) qs.set('store', storeFilter);

    const res = await fetch(`/api/portal/reports/summary?${qs}`);
    const data = (await res.json()) as { summary?: ReportSummary; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '無法載入報表');
      setSummary(null);
      return;
    }
    setSummary(data.summary ?? null);
  }, [from, to, store, storeFilter, showStorePicker]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    const res = await fetch('/api/portal/reports/sync-notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: storeFilter ?? store, fixNotion: true }),
    });
    const data = (await res.json()) as {
      error?: string;
      upserted?: number;
      notionUpdated?: number;
      latestRecordDate?: string;
      notionRows?: number;
    };
    setSyncing(false);
    if (!res.ok) {
      setError(data.error ?? '同步失敗');
      return;
    }
    setSyncMsg(
      `已同步 ${data.notionRows ?? 0} 筆；Notion 標題/師傅修正 ${data.notionUpdated ?? 0} 筆；寫入 ${data.upserted ?? 0} 筆。最新日期：${data.latestRecordDate ?? '—'}`,
    );
    await load();
  }

  return (
    <div className="space-y-6">
      {error ? <StatusBanner variant="error">{error}</StatusBanner> : null}
      {syncMsg ? <StatusBanner variant="success">{syncMsg}</StatusBanner> : null}

      <div className="glass-card flex flex-wrap items-end gap-4 p-6">
        <div className="space-y-2">
          <Label htmlFor="from">起日</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">迄日</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {showStorePicker ? (
          <div className="space-y-2">
            <Label>分店</Label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value as StoreSlug)}
              className="flex h-10 rounded-md border border-input bg-input px-3 text-sm"
            >
              {STORE_LIST.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? '載入中…' : '查詢'}
        </Button>
        {canSyncNotion ? (
          <Button type="button" variant="outline" disabled={syncing} onClick={() => void handleSync()}>
            {syncing ? '同步中…' : '從 Notion 同步'}
          </Button>
        ) : null}
      </div>

      {summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <p className="text-xs text-muted-foreground">區間營收</p>
              <p className="mt-1 text-2xl font-semibold">${fmt(summary.totalRevenue)}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs text-muted-foreground">筆數</p>
              <p className="mt-1 text-2xl font-semibold">{fmt(summary.transactionCount)}</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs text-muted-foreground">資料最新日期</p>
              <p className="mt-1 text-2xl font-semibold">{summary.latestRecordDate ?? '—'}</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="glass-card overflow-x-auto p-5">
              <h3 className="mb-3 text-sm font-semibold">付款方式</h3>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(summary.byPayment)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <tr key={k} className="border-b border-border/40">
                        <td className="py-2 pr-4">{k}</td>
                        <td className="py-2 text-right">${fmt(v)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="glass-card overflow-x-auto p-5">
              <h3 className="mb-3 text-sm font-semibold">師傅業績</h3>
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(summary.byStaff)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <tr key={k} className="border-b border-border/40">
                        <td className="py-2 pr-4">{k}</td>
                        <td className="py-2 text-right">${fmt(v)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-card overflow-x-auto p-5">
            <h3 className="mb-3 text-sm font-semibold">每日明細</h3>
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs text-muted-foreground">
                  <th className="pb-2 text-left font-medium">日期</th>
                  <th className="pb-2 text-right font-medium">筆數</th>
                  <th className="pb-2 text-right font-medium">金額</th>
                </tr>
              </thead>
              <tbody>
                {summary.byDay.map((d) => (
                  <tr key={d.date} className="border-b border-border/40">
                    <td className="py-2">{d.date}</td>
                    <td className="py-2 text-right">{d.count}</td>
                    <td className="py-2 text-right">${fmt(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : loading ? (
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        營收定義對齊 Notion「當月營收」：服務/儲值/收入，且付款方式含現金、Line、富邦、街口、會員使用等。資料匯入後可停用
        Notion，以本站為準。
      </p>
    </div>
  );
}

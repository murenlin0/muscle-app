'use client';

import { useCallback, useEffect, useState } from 'react';
import { EditableLedgerTable, type LedgerRow } from '@/components/portal/editable-ledger-table';
import { StatusBanner } from '@/components/portal/status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STORE_LIST, type StoreSlug } from '@/lib/stores';
import { TRANSACTION_CATEGORIES, type TransactionCategory } from '@/lib/transaction-category';

interface ReportList {
  rows: LedgerRow[];
  totalRows: number;
  totalAmount: number;
  latestRecordDate: string | null;
}

function fmt(n: number) {
  return n.toLocaleString('zh-TW');
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
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
  const [category, setCategory] = useState<TransactionCategory | ''>('');
  const [report, setReport] = useState<ReportList | null>(null);
  const [stats, setStats] = useState({ totalRows: 0, totalAmount: 0 });
  const [fetchKey, setFetchKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [notionStatus, setNotionStatus] = useState<string | null>(null);

  const activeStore = storeFilter ?? store;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ from, to });
    qs.set('store', activeStore);
    if (category) qs.set('category', category);
    const key = `${from}|${to}|${activeStore}|${category}`;

    const res = await fetch(`/api/portal/reports/transactions?${qs}`);
    const data = (await res.json()) as { report?: ReportList; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '無法載入報表');
      setReport(null);
      return;
    }
    const r = data.report ?? null;
    setReport(r);
    setFetchKey(key);
    if (r) {
      setStats({ totalRows: r.totalRows, totalAmount: r.totalAmount });
    }
  }, [from, to, activeStore, category]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleTestNotion() {
    setTesting(true);
    setNotionStatus(null);
    setError(null);
    const res = await fetch('/api/portal/reports/notion-status');
    const data = (await res.json()) as {
      ok?: boolean;
      hint?: string;
      databaseTitle?: string;
      diagnostics?: {
        configured: boolean;
        envVarUsed: string | null;
        keyPrefix: string | null;
        keyLength: number;
        formatOk: boolean;
        formatHint: string | null;
      };
      notionStatus?: number;
      notionCode?: string;
      notionMessage?: string;
      vercelEnv?: string;
      error?: string;
    };
    setTesting(false);
    if (!res.ok) {
      setError(data.error ?? '無法測試 Notion 連線');
      return;
    }
    const d = data.diagnostics;
    if (data.ok) {
      setNotionStatus(
        `連線成功（${data.vercelEnv}）。資料庫：${data.databaseTitle ?? '新版筋棧1店每日紀錄'}。金鑰：${d?.envVarUsed} ${d?.keyPrefix}…`,
      );
      return;
    }
    const parts = [
      data.hint,
      d?.formatHint,
      data.notionMessage ? `Notion：${data.notionCode ?? data.notionStatus} ${data.notionMessage}` : null,
      d?.configured
        ? `已讀到 ${d.envVarUsed}（${d.keyPrefix}…，長度 ${d.keyLength}）`
        : 'Vercel 未讀到 NOTION_API_KEY',
    ].filter(Boolean);
    setError(parts.join(' '));
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    const res = await fetch('/api/portal/reports/sync-notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: activeStore,
        fixNotion: false,
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      upserted?: number;
      latestRecordDate?: string;
      notionRows?: number;
    };
    setSyncing(false);
    if (!res.ok) {
      setError(data.error ?? '同步失敗');
      return;
    }
    setSyncMsg(
      `已匯入全部 ${data.upserted ?? 0} 筆（Notion 共 ${data.notionRows ?? 0} 筆）。最新日期：${data.latestRecordDate ?? '—'}`,
    );
    await load();
  }

  return (
    <div className="space-y-4">
      {error ? <StatusBanner variant="error">{error}</StatusBanner> : null}
      {syncMsg ? <StatusBanner variant="success">{syncMsg}</StatusBanner> : null}
      {notionStatus ? <StatusBanner variant="success">{notionStatus}</StatusBanner> : null}

      {canSyncNotion ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[#333] bg-[#1c1c1c] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[#e0e0e0]">Notion 歷史資料匯入</p>
            <p className="mt-0.5 text-xs text-[#888]">一次性匯入全部，之後請在本表直接編輯。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={testing} onClick={() => void handleTestNotion()}>
              {testing ? '測試中…' : '測試 Notion 連線'}
            </Button>
            <Button type="button" size="sm" disabled={syncing} onClick={() => void handleSync()}>
              {syncing ? '匯入中…' : '一鍵匯入全部'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-md border border-[#333] bg-[#1c1c1c] p-3">
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs text-[#888]">
            起日
          </Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 border-[#444] bg-[#252525]" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs text-[#888]">
            迄日
          </Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 border-[#444] bg-[#252525]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-[#888]">類型</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory | '')}
            className="flex h-9 min-w-[8rem] rounded-md border border-[#444] bg-[#252525] px-2 text-sm"
          >
            <option value="">全部</option>
            {TRANSACTION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {showStorePicker ? (
          <div className="space-y-1">
            <Label className="text-xs text-[#888]">分店</Label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value as StoreSlug)}
              className="flex h-9 rounded-md border border-[#444] bg-[#252525] px-2 text-sm"
            >
              {STORE_LIST.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? '載入中…' : '篩選'}
        </Button>
      </div>

      <div className="flex items-center justify-between text-xs text-[#888]">
        <span>
          {stats.totalRows > 0 || report
            ? `共 ${fmt(stats.totalRows)} 筆 · 金額合計 $${fmt(stats.totalAmount)}`
            : ' '}
        </span>
        {report?.latestRecordDate ? (
          <span>資料最新：{formatDate(report.latestRecordDate)}</span>
        ) : null}
      </div>

      <EditableLedgerTable
        rows={report?.rows ?? []}
        loading={loading}
        fetchKey={fetchKey}
        storeId={activeStore}
        onStatsChange={setStats}
      />

      <p className="text-xs text-[#666]">
        點欄位即可編輯，離開欄位自動儲存（列右側短暫顯示 ✓）。拖曳欄位右側邊線可調整寬度。
      </p>
    </div>
  );
}

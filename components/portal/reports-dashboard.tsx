'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusBanner } from '@/components/portal/status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STORE_LIST, type StoreSlug } from '@/lib/stores';
import { TRANSACTION_CATEGORIES, type TransactionCategory } from '@/lib/transaction-category';
import { cn } from '@/lib/utils';

interface TransactionRow {
  id: string;
  occurredOn: string;
  title: string;
  amount: number;
  category: TransactionCategory;
  paymentMethods: string[];
}

interface ReportList {
  rows: TransactionRow[];
  totalRows: number;
  totalAmount: number;
  latestRecordDate: string | null;
}

const CATEGORY_STYLE: Record<TransactionCategory, string> = {
  一般消費: 'bg-amber-900/30 text-amber-200',
  會員儲值: 'bg-pink-900/30 text-pink-200',
  會員使用: 'bg-purple-900/30 text-purple-200',
  會員補差額: 'bg-purple-900/20 text-purple-300',
  轉移: 'bg-emerald-900/30 text-emerald-200',
  支出: 'bg-blue-900/30 text-blue-200',
  工資: 'bg-zinc-700/40 text-zinc-200',
  收入: 'bg-orange-900/30 text-orange-200',
  分紅: 'bg-red-900/30 text-red-200',
};

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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [notionStatus, setNotionStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ from, to });
    if (showStorePicker) qs.set('store', store);
    else if (storeFilter) qs.set('store', storeFilter);
    if (category) qs.set('category', category);

    const res = await fetch(`/api/portal/reports/transactions?${qs}`);
    const data = (await res.json()) as { report?: ReportList; error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? '無法載入報表');
      setReport(null);
      return;
    }
    setReport(data.report ?? null);
  }, [from, to, store, storeFilter, showStorePicker, category]);

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
        storeId: storeFilter ?? store,
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

      {canSyncNotion ? (
        <div className="glass-card flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium">Notion 歷史資料匯入</p>
            <p className="mt-1 text-xs text-muted-foreground">
              一次匯入「新版筋棧1店每日紀錄」全部資料，不受下方日期篩選影響。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={testing} onClick={() => void handleTestNotion()}>
              {testing ? '測試中…' : '測試 Notion 連線'}
            </Button>
            <Button type="button" disabled={syncing} onClick={() => void handleSync()}>
              {syncing ? '匯入中…' : '一鍵匯入全部'}
            </Button>
          </div>
        </div>
      ) : null}
      {notionStatus ? <StatusBanner variant="success">{notionStatus}</StatusBanner> : null}

      <div className="glass-card flex flex-wrap items-end gap-3 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="from" className="text-xs">
            起日
          </Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to" className="text-xs">
            迄日
          </Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">類型</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory | '')}
            className="flex h-9 min-w-[8rem] rounded-md border border-input bg-input px-2 text-sm"
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
          <div className="space-y-1.5">
            <Label className="text-xs">分店</Label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value as StoreSlug)}
              className="flex h-9 rounded-md border border-input bg-input px-2 text-sm"
            >
              {STORE_LIST.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="button" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? '載入中…' : '篩選'}
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
          <span>
            {report
              ? `共 ${fmt(report.totalRows)} 筆 · 金額合計 $${fmt(report.totalAmount)}`
              : '載入中…'}
          </span>
          {report?.latestRecordDate ? (
            <span>資料最新：{formatDate(report.latestRecordDate)}</span>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">日期</th>
                <th className="px-4 py-2.5 font-medium">標題</th>
                <th className="px-4 py-2.5 font-medium text-right">金額數字</th>
                <th className="px-4 py-2.5 font-medium">類型</th>
                <th className="px-4 py-2.5 font-medium">付款方式</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    載入中…
                  </td>
                </tr>
              ) : !report?.rows.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    此區間尚無資料。總管理員可按上方「一鍵匯入全部」。
                  </td>
                </tr>
              ) : (
                report.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {formatDate(row.occurredOn)}
                    </td>
                    <td className="max-w-[28rem] truncate px-4 py-2" title={row.title}>
                      {row.title}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                      {fmt(row.amount)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-flex rounded px-2 py-0.5 text-xs',
                          CATEGORY_STYLE[row.category] ?? 'bg-muted text-muted-foreground',
                        )}
                      >
                        {row.category}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {row.paymentMethods.length ? row.paymentMethods.join('、') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        欄位對齊 Notion 每日紀錄。類型已簡化為九種；匯入後以本站資料庫為準，可停用 Notion。
      </p>
    </div>
  );
}

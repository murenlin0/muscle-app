'use client';

import { useState } from 'react';
import { PortalShell } from '@/app/components/portal-shell';
import { StatusBanner } from '@/components/portal/status-banner';
import { useStoreAdminGuard } from '@/components/portal/use-portal-guard';
import { useStore } from '@/components/store-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ManagerImportPage() {
  const { store, apiBase } = useStore();
  const managerBase = `/manager/${store.slug}`;
  const { loading: bootstrapping } = useStoreAdminGuard(store.slug);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${apiBase}/admin/import-notion`, {
      method: 'POST',
      body: form,
    });

    const data = (await res.json()) as {
      error?: string;
      clientsUpserted?: number;
      rowsTotal?: number;
      skippedRows?: number;
      sample?: { name: string; phone: string; initial_balance: number }[];
    };

    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? '匯入失敗');
      return;
    }

    setResult(
      `【${store.name}】完成：${data.clientsUpserted} 位會員（CSV ${data.rowsTotal} 列，略過 ${data.skippedRows} 列）\n` +
        JSON.stringify(data.sample, null, 2),
    );
  }

  if (bootstrapping) {
    return (
      <PortalShell
        title="會員匯入"
        subtitle={store.name}
        variant="admin"
        size="lg"
        backHref={managerBase}
      >
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="Notion 匯入"
      subtitle={store.name}
      variant="admin"
      size="lg"
      backHref={managerBase}
    >
      <div className="glass-card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv">CSV 檔案</Label>
            <Input
              id="csv"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:font-medium file:text-primary-foreground"
              required
            />
          </div>
          <Button type="submit" className="w-full shadow-md shadow-primary/20" disabled={loading || !file}>
            {loading ? '匯入中…' : '開始匯入'}
          </Button>
        </form>
      </div>
      {error ? (
        <div className="mt-4">
          <StatusBanner variant="error">{error}</StatusBanner>
        </div>
      ) : null}
      {result ? (
        <pre className="glass-card mt-4 whitespace-pre-wrap p-4 text-xs text-muted-foreground">{result}</pre>
      ) : null}
    </PortalShell>
  );
}

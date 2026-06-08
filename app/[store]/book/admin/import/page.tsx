'use client';

import { useState } from 'react';
import { PageShell } from '@/app/components/page-shell';
import { useStore } from '@/components/store-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminImportPage() {
  const { bookBase, apiBase, store } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [secret, setSecret] = useState('');
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

    const headers: Record<string, string> = {};
    if (secret) headers['x-admin-secret'] = secret;

    const res = await fetch(`${apiBase}/admin/import-notion`, {
      method: 'POST',
      headers,
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

  return (
    <PageShell title="Notion 匯入" subtitle={`Admin · ${store.name}`} backHref={bookBase}>
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
          <div className="space-y-2">
            <Label htmlFor="secret">Admin 密鑰（可選）</Label>
            <Input
              id="secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="ADMIN_IMPORT_SECRET"
            />
          </div>
          <Button type="submit" className="w-full shadow-md shadow-primary/20" disabled={loading || !file}>
            {loading ? '匯入中…' : '開始匯入'}
          </Button>
        </form>
      </div>
      {error ? <pre className="mt-4 whitespace-pre-wrap text-sm text-destructive">{error}</pre> : null}
      {result ? (
        <pre className="glass-card mt-4 whitespace-pre-wrap p-4 text-xs text-muted-foreground">{result}</pre>
      ) : null}
    </PageShell>
  );
}

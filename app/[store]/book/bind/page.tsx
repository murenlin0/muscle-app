'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Phone, UserRound } from 'lucide-react';
import { PageShell } from '@/app/components/page-shell';
import { useLiff } from '@/app/components/liff-provider';
import { BindSubmitButton } from '@/components/bind-submit-button';
import { LiffStatusGate } from '@/components/liff-status-gate';
import { LoadingScreen } from '@/components/loading-screen';
import { useStore } from '@/components/store-provider';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function BindForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = searchParams.get('edit') === '1';
  const { bookBase, apiBase } = useStore();

  const { status, lineUserId, client, refreshClient } = useLiff();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client) {
      setName(client.name);
      setPhone(client.phone);
    }
  }, [client]);

  useEffect(() => {
    if (status === 'ready' && client && !isEdit) {
      router.replace(bookBase);
    }
  }, [status, client, isEdit, router, bookBase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lineUserId) return;

    setSubmitting(true);
    setError(null);

    const res = await fetch(`${apiBase}/clients/bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-user-id': lineUserId,
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ name, phone }),
    });

    const data = (await res.json()) as { error?: string };

    if (!res.ok) {
      setError(data.error ?? '綁定失敗');
      setSubmitting(false);
      return;
    }

    await refreshClient();
    router.replace(bookBase);
  }

  return (
    <PageShell
      compact
      title={isEdit ? '修改資料' : '填寫預約資料'}
      subtitle={isEdit ? '更新本名與電話' : '首次使用請先綁定，之後會自動帶入'}
      backHref={isEdit ? `${bookBase}/wallet` : bookBase}
    >
      <Card className="glass-card border-primary/15 shadow-xl shadow-black/30">
        <CardHeader className="border-b border-border/60 py-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-bold">會員資料</CardTitle>
            {client?.is_vip ? (
              <Badge variant="outline" className="border-primary/50 text-primary">
                VIP
              </Badge>
            ) : null}
          </div>
          <CardDescription className="text-sm">
            姓名與電話會用於預約確認。若電話已是店內會員，綁定後會沿用原有餘額與儲值紀錄。
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-semibold">
                本名
              </Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="name"
                  className="input-neon h-14 border-primary/20 bg-input/50 pl-11 text-lg"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  required
                  autoComplete="name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-semibold">
                電話
              </Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="phone"
                  className="input-neon h-14 border-primary/20 bg-input/50 pl-11 text-lg"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Number"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                />
              </div>
              <p className="text-sm text-muted-foreground">送出時會自動移除空格</p>
            </div>
            {error ? (
              <p className="rounded-lg bg-destructive/10 px-4 py-3 text-base text-destructive">
                {error}
              </p>
            ) : null}
            <div className="pt-10">
              <BindSubmitButton loading={submitting}>
                {submitting ? '儲存中…' : isEdit ? '儲存修改' : '完成綁定'}
              </BindSubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export default function BindPage() {
  return (
    <LiffStatusGate>
      <Suspense fallback={<LoadingScreen />}>
        <BindForm />
      </Suspense>
    </LiffStatusGate>
  );
}

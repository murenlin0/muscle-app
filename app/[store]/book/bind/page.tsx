'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Phone, UserRound } from 'lucide-react';
import { PageShell } from '@/app/components/page-shell';
import { useLiff } from '@/app/components/liff-provider';
import { BindSubmitButton } from '@/components/bind-submit-button';
import { LiffStatusGate } from '@/components/liff-status-gate';
import { LoadingScreen } from '@/components/loading-screen';
import { useStore } from '@/components/store-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/phone';
import type { Client } from '@/lib/types/database';

type BindAction = 'linked' | 'created' | 'updated';

type BindSuccess = {
  action: BindAction;
  client: Client;
};

function BindSuccessCard({
  result,
  isEdit,
  onContinue,
}: {
  result: BindSuccess;
  isEdit: boolean;
  onContinue: () => void;
}) {
  const { action, client } = result;

  const title =
    isEdit && action !== 'linked'
      ? '會員資料已更新'
      : action === 'linked'
        ? '已找到您的會員帳戶'
        : action === 'created'
          ? '已建立會員資料'
          : '綁定完成';

  const description =
    action === 'linked'
      ? '此電話已是店內會員，已與您的 LINE 連結，餘額與儲值紀錄會沿用。'
      : action === 'created'
        ? '之後預約與儲值金都會記在此帳戶。'
        : isEdit
          ? '姓名與電話已儲存。'
          : '您可以使用預約與儲值金功能。';

  return (
    <Card className="glass-card border-primary/20 shadow-xl shadow-black/30">
      <CardHeader className="border-b border-border/60 py-4 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <CheckCircle2 className="size-8" strokeWidth={2} />
        </div>
        <CardTitle className="text-lg font-bold">{title}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="rounded-lg border border-border/60 bg-input/40 px-4 py-3 text-base">
          <p>
            <span className="text-muted-foreground">姓名：</span>
            {client.name}
            {client.is_vip ? (
              <Badge variant="outline" className="ml-2 border-primary/50 text-primary">
                VIP
              </Badge>
            ) : null}
          </p>
          <p className="mt-2">
            <span className="text-muted-foreground">電話：</span>
            {client.phone}
          </p>
          {action === 'linked' || client.balance > 0 ? (
            <p className="mt-2 font-semibold text-primary">
              可用餘額：{formatCurrency(client.balance)}
            </p>
          ) : null}
        </div>
        <Button type="button" className="h-12 w-full text-base" onClick={onContinue}>
          {isEdit ? '返回儲值金' : '開始使用'}
        </Button>
      </CardContent>
    </Card>
  );
}

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
  const [success, setSuccess] = useState<BindSuccess | null>(null);

  useEffect(() => {
    if (client) {
      setName(client.name);
      setPhone(client.phone);
    }
  }, [client]);

  useEffect(() => {
    if (status === 'ready' && client && !isEdit && !success) {
      router.replace(bookBase);
    }
  }, [status, client, isEdit, success, router, bookBase]);

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

    const data = (await res.json()) as {
      client?: Client;
      action?: BindAction;
      error?: string;
    };

    if (!res.ok || !data.client || !data.action) {
      setError(data.error ?? '綁定失敗');
      setSubmitting(false);
      return;
    }

    await refreshClient();
    setSuccess({ action: data.action, client: data.client });
    setSubmitting(false);
  }

  function handleContinue() {
    router.replace(isEdit ? `${bookBase}/wallet` : bookBase);
  }

  if (success) {
    return (
      <PageShell compact title="綁定成功" subtitle={isEdit ? undefined : '歡迎使用'} backHref={bookBase}>
        <BindSuccessCard result={success} isEdit={isEdit} onContinue={handleContinue} />
      </PageShell>
    );
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
                  placeholder="請輸入本名"
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
                  placeholder="09xxxxxxxx"
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

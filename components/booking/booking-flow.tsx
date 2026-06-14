'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import liff from '@line/liff';
import { Check, Copy } from 'lucide-react';
import { PageShell } from '@/app/components/page-shell';
import { useLiff } from '@/app/components/liff-provider';
import { ServiceStep } from '@/components/booking/service-step';
import { TimeStep } from '@/components/booking/time-step';
import { BindSubmitButton } from '@/components/bind-submit-button';
import { LoadingScreen } from '@/components/loading-screen';
import { useStore } from '@/components/store-provider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  BOOKING_STAFF_UNASSIGNED,
  buildBookingDraft,
  buildBookingMessageText,
} from '@/lib/booking-draft';
import type { Service, Staff } from '@/lib/types/database';
import { getLiffIdForStore } from '@/lib/store-liff';
import { cn } from '@/lib/utils';

type Step = 1 | 2 | 3;

function StepIndicator({ step }: { step: Step }) {
  const labels = ['選服務', '選時間', '確認送出'];
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {labels.map((label, index) => {
        const n = (index + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2">
            {index > 0 ? <span className="text-muted-foreground/40">—</span> : null}
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                active && 'bg-primary/15 text-primary',
                done && 'text-primary/70',
                !active && !done && 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[10px]',
                  active && 'bg-primary text-primary-foreground',
                  done && 'bg-primary/20 text-primary',
                  !active && !done && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3" /> : n}
              </span>
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BookingFlow() {
  const router = useRouter();
  const { bookBase, apiBase, store } = useStore();
  const { client, status } = useLiff();

  const [step, setStep] = useState<Step>(1);
  const [services, setServices] = useState<Service[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [staffName, setStaffName] = useState(BOOKING_STAFF_UNASSIGNED);
  const [headcount, setHeadcount] = useState(1);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentMode, setSentMode] = useState<'line' | 'copied' | null>(null);

  const now = useMemo(() => new Date(), [step]);

  useEffect(() => {
    if (status === 'ready' && !client) {
      router.replace(`${bookBase}/bind`);
    }
  }, [status, client, router, bookBase]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setLoadingCatalog(true);
      setCatalogError(null);
      try {
        const [servicesRes, staffRes] = await Promise.all([
          fetch(`${apiBase}/services`),
          fetch(`${apiBase}/staff`),
        ]);
        const servicesData = (await servicesRes.json()) as {
          services?: Service[];
          error?: string;
        };
        const staffData = (await staffRes.json()) as { staff?: Staff[]; error?: string };

        if (!servicesRes.ok) throw new Error(servicesData.error ?? '無法載入服務');
        if (!staffRes.ok) throw new Error(staffData.error ?? '無法載入師傅');

        if (cancelled) return;
        setServices(servicesData.services ?? []);
        setStaffList(staffData.staff ?? []);
      } catch (e) {
        if (!cancelled) {
          setCatalogError(e instanceof Error ? e.message : '載入失敗');
        }
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    }

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const messageText = useMemo(() => {
    if (!client || !selectedService || !startsAt) return '';
    const draft = buildBookingDraft({
      storeSlug: store.slug,
      storeLabel: store.messageStoreLabel,
      staffName,
      clientName: client.name,
      phone: client.phone,
      durationMinutes: selectedService.duration_minutes,
      startsAt,
      headcount,
      note,
    });
    return buildBookingMessageText(draft);
  }, [client, selectedService, startsAt, staffName, headcount, note, store]);

  function handleServiceSelect(service: Service) {
    setSelectedService(service);
    setStartsAt(null);
    setStep(2);
  }

  function handleChangeService() {
    setStep(1);
  }

  async function handleSend() {
    if (!messageText) return;
    setSending(true);
    setSendError(null);

    try {
      const liffId = getLiffIdForStore(store.slug);
      if (liffId && liff.isInClient() && liff.isApiAvailable('sendMessages')) {
        await liff.sendMessages([{ type: 'text', text: messageText }]);
        setSentMode('line');
        liff.closeWindow();
        return;
      }

      await navigator.clipboard.writeText(messageText);
      setSentMode('copied');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '送出失敗');
    } finally {
      setSending(false);
    }
  }

  if (status !== 'ready' || !client) {
    return <LoadingScreen message="載入中…" />;
  }

  if (sentMode === 'copied') {
    return (
      <PageShell title="已複製預約訊息" subtitle="本機測試模式：請貼到 LINE 官方帳號" backHref={bookBase}>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">訊息已複製</CardTitle>
            <CardDescription>正式環境會直接透過 LINE 送出並關閉視窗</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-input/40 p-4 font-mono text-sm leading-relaxed">
              {messageText}
            </pre>
            <Button type="button" className="w-full" onClick={() => router.replace(bookBase)}>
              返回會員中心
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const subtitles: Record<Step, string> = {
    1: '點選服務後自動進入選時間',
    2: '選日期與時段，可指定師傅與人數',
    3: '確認後送出 LINE 預約訊息',
  };

  return (
    <PageShell title="預約" subtitle={subtitles[step]} backHref={bookBase}>
      <StepIndicator step={step} />

      {catalogError ? (
        <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {catalogError}
        </p>
      ) : null}

      {step === 1 ? (
        <ServiceStep
          services={services}
          loading={loadingCatalog}
          client={client}
          selectedId={selectedService?.id ?? null}
          onSelect={handleServiceSelect}
        />
      ) : null}

      {step === 2 && selectedService ? (
        <TimeStep
          service={selectedService}
          startsAt={startsAt}
          now={now}
          staffList={staffList}
          staffName={staffName}
          headcount={headcount}
          note={note}
          onChangeService={handleChangeService}
          onSelectSlot={setStartsAt}
          onStaffChange={setStaffName}
          onHeadcountChange={setHeadcount}
          onNoteChange={setNote}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      ) : null}

      {step === 3 && selectedService && startsAt ? (
        <div className="space-y-5">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">會員資料</CardTitle>
              <CardDescription>如需修改請至儲值金頁面</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-base">
              <p>
                <span className="text-muted-foreground">姓名：</span>
                {client.name}
              </p>
              <p>
                <span className="text-muted-foreground">電話：</span>
                {client.phone}
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-primary/15">
            <CardHeader>
              <CardTitle className="text-lg">預約訊息預覽</CardTitle>
              <CardDescription>送出後師傅可從 LINE 官方帳號複製此格式</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-input/40 p-4 font-mono text-sm leading-relaxed">
                {messageText}
              </pre>
            </CardContent>
          </Card>

          {sendError ? (
            <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{sendError}</p>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setStep(2)}>
              上一步
            </Button>
            <BindSubmitButton type="button" className="flex-[2]" loading={sending} onClick={() => void handleSend()}>
              {sending ? '送出中…' : '送出 LINE 預約'}
            </BindSubmitButton>
          </div>

          {!getLiffIdForStore(store.slug) ? (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <Copy className="size-3.5" />
              本機測試會複製訊息到剪貼簿
            </p>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}

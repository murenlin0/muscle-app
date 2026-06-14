'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import liff from '@line/liff';
import { ChevronLeft, Copy } from 'lucide-react';
import { useLiff } from '@/app/components/liff-provider';
import { BookingHero } from '@/components/booking/booking-hero';
import { BookingNav } from '@/components/booking/booking-nav';
import { BookingStepIndicator } from '@/components/booking/booking-step-indicator';
import { BookingSummary } from '@/components/booking/booking-summary';
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
import { BOOKING_HOURS_LABEL } from '@/lib/booking-hours';
import { getLiffIdForStore } from '@/lib/store-liff';

type Step = 1 | 2 | 3;

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

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (step !== 2) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [step]);

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
      <main className="min-h-svh px-5 py-8">
        <div className="mx-auto max-w-md">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">訊息已複製</CardTitle>
              <CardDescription>本機測試：請貼到 LINE 官方帳號</CardDescription>
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
        </div>
      </main>
    );
  }

  const canNextStep1 = Boolean(selectedService);
  const canNextStep2 = Boolean(startsAt);

  return (
    <main className="min-h-svh pb-10">
      <div className="mx-auto max-w-md px-5 pt-4">
        <Link
          href={bookBase}
          aria-label="返回"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
          返回
        </Link>

        {step === 1 ? <BookingHero /> : null}
        <BookingStepIndicator step={step} />

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
            onSelect={setSelectedService}
          />
        ) : null}

        {step === 2 && selectedService ? (
          <TimeStep
            service={selectedService}
            client={client}
            startsAt={startsAt}
            now={now}
            staffList={staffList}
            staffName={staffName}
            headcount={headcount}
            note={note}
            onSelectSlot={setStartsAt}
            onStaffChange={setStaffName}
            onHeadcountChange={setHeadcount}
            onNoteChange={setNote}
          />
        ) : null}

        {step === 3 && selectedService && startsAt ? (
          <div className="space-y-5">
            <h2 className="text-lg font-bold">確認並送出</h2>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">會員資料</CardTitle>
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
                <CardTitle className="text-base">預約訊息預覽</CardTitle>
                <CardDescription>送出後師傅可從 LINE 官方帳號複製此格式</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-input/40 p-4 font-mono text-sm leading-relaxed">
                  {messageText}
                </pre>
              </CardContent>
            </Card>

            {sendError ? (
              <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {sendError}
              </p>
            ) : null}

            {!getLiffIdForStore(store.slug) ? (
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <Copy className="size-3.5" />
                本機測試會複製訊息到剪貼簿
              </p>
            ) : null}
          </div>
        ) : null}

        {step < 3 ? (
          <BookingNav
            showBack={step > 1}
            onBack={() => setStep((step - 1) as Step)}
            onNext={() => setStep((step + 1) as Step)}
            nextDisabled={step === 1 ? !canNextStep1 : !canNextStep2}
          />
        ) : (
          <div className="flex gap-2 py-2">
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setStep(2)}>
              上一步
            </Button>
            <BindSubmitButton
              type="button"
              className="h-11 flex-[2]"
              loading={sending}
              onClick={() => void handleSend()}
            >
              {sending ? '送出中…' : '送出 LINE 預約'}
            </BindSubmitButton>
          </div>
        )}

        <div className="mt-5">
          <BookingSummary
            client={client}
            service={selectedService}
            staffName={staffName}
            startsAt={startsAt}
          />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          © {new Date().getFullYear()} 筋棧 · {store.name} · 營業時間 {BOOKING_HOURS_LABEL}
        </p>
      </div>
    </main>
  );
}

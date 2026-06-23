'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import liff from '@line/liff';
import { ChevronLeft, Copy, AlertTriangle } from 'lucide-react';
import { useLiff } from '@/app/components/liff-provider';
import { BookingHero } from '@/components/booking/booking-hero';
import { BookingNav } from '@/components/booking/booking-nav';
import { BookingSendChatOpened, BookingSendCopied } from '@/components/booking/booking-send-result';
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
  buildBookingDraft,
  buildBookingMessageText,
} from '@/lib/booking-draft';
import type { Service } from '@/lib/types/database';
import { BOOKING_HOURS_LABEL } from '@/lib/booking-hours';
import { getLiffIdForStore } from '@/lib/store-liff';
import { sendBookingToOfficialLine } from '@/lib/line-booking-send';

type Step = 1 | 2 | 3;

export function BookingFlow() {
  const router = useRouter();
  const { bookBase, apiBase, store } = useStore();
  const { client, status } = useLiff();

  const [step, setStep] = useState<Step>(1);
  const [services, setServices] = useState<Service[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentMode, setSentMode] = useState<'line' | 'chat_opened' | 'copied' | null>(null);

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
        const servicesRes = await fetch(`${apiBase}/services`);
        const servicesData = (await servicesRes.json()) as {
          services?: Service[];
          error?: string;
        };

        if (!servicesRes.ok) throw new Error(servicesData.error ?? '無法載入服務');

        if (cancelled) return;
        setServices(servicesData.services ?? []);
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
      clientName: client.name,
      phone: client.phone,
      durationMinutes: selectedService.duration_minutes,
      startsAt,
      note,
    });
    return buildBookingMessageText(draft);
  }, [client, selectedService, startsAt, note, store]);

  async function handleSend() {
    if (!messageText) return;
    setSending(true);
    setSendError(null);

    try {
      const liffId = getLiffIdForStore(store.slug);
      if (liffId && liff.isInClient()) {
        const result = await sendBookingToOfficialLine(messageText, store.lineOfficialUrl, store.slug);
        if (result.mode === 'sent') {
          setSentMode('line');
          liff.closeWindow();
          return;
        }
        setSentMode(result.mode);
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

  if (sentMode === 'line') {
    return null;
  }

  if (sentMode === 'chat_opened') {
    return (
      <BookingSendChatOpened
        messageText={messageText}
        onDone={() => router.replace(bookBase)}
      />
    );
  }

  if (sentMode === 'copied') {
    return (
      <BookingSendCopied
        messageText={messageText}
        storeSlug={store.slug}
        lineOfficialUrl={store.lineOfficialUrl}
        onDone={() => router.replace(bookBase)}
        onRetryOpenChat={() => setSentMode('chat_opened')}
      />
    );
  }

  const canNextStep1 = Boolean(selectedService);
  const canNextStep2 = Boolean(startsAt);

  return (
    <main className="min-h-svh pb-10">
      <div className="liff-content pt-4">
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
            note={note}
            onSelectSlot={setStartsAt}
            onNoteChange={setNote}
          />
        ) : null}

        {step === 3 && selectedService && startsAt ? (
          <div className="space-y-5">
            <div
              className="rounded-2xl border-2 border-amber-400/80 bg-amber-500/20 px-4 py-5 text-center shadow-[0_0_28px_oklch(0.75_0.15_85/0.3)]"
              role="alert"
            >
              <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-amber-500/30 text-amber-100">
                <AlertTriangle className="size-7" strokeWidth={2.5} />
              </div>
              <p className="text-xl font-bold text-amber-50">注意：預約尚未成功</p>
              <p className="mt-2 text-base font-semibold leading-relaxed text-amber-100">
                按下「送出 LINE 預約」後，請在 LINE 對話中
                <span className="underline decoration-2 underline-offset-2">再按一次「傳送」</span>
                ，我們才收得到。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-100/90">
                小編收到訊息後，會再跟您做最後確認。
              </p>
            </div>

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
              </CardHeader>
              <CardContent className="space-y-3">
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
          <div className="space-y-3 py-2">
            <p className="rounded-xl border border-amber-400/60 bg-amber-500/15 px-3 py-2.5 text-center text-sm font-bold text-amber-100">
              送出後請在 LINE 按「傳送」，預約才算完成
            </p>
            <div className="flex gap-2">
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
          </div>
        )}

        <div className="mt-5">
          <BookingSummary
            client={client}
            service={selectedService}
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

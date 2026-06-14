'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import liff from '@line/liff';
import { CalendarDays, Check, ChevronRight, Copy, Loader2 } from 'lucide-react';
import { PageShell } from '@/app/components/page-shell';
import { useLiff } from '@/app/components/liff-provider';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BOOKING_STAFF_UNASSIGNED,
  buildBookingDraft,
  buildBookingMessageText,
} from '@/lib/booking-draft';
import { formatCurrency } from '@/lib/phone';
import type { Service, Staff } from '@/lib/types/database';
import { getLiffIdForStore } from '@/lib/store-liff';
import { cn } from '@/lib/utils';

const OPEN_HOUR = 10;
const CLOSE_HOUR = 21;
const SLOT_MINUTES = 30;

type Step = 1 | 2 | 3;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDayLabel(date: Date, index: number): string {
  if (index === 0) return '今天';
  if (index === 1) return '明天';
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${date.getMonth() + 1}/${date.getDate()} 週${weekdays[date.getDay()]}`;
}

function formatTimeLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatSelectedDateTime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d} ${formatTimeLabel(date)}`;
}

function buildSlotsForDay(day: Date): Date[] {
  const slots: Date[] = [];
  const base = startOfDay(day);
  for (let minutes = OPEN_HOUR * 60; minutes < CLOSE_HOUR * 60; minutes += SLOT_MINUTES) {
    const slot = new Date(base);
    slot.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    slots.push(slot);
  }
  return slots;
}

function slotIsPast(slot: Date, now: Date): boolean {
  return slot.getTime() <= now.getTime();
}

function slotOverlapsSelection(
  slot: Date,
  selected: Date | null,
  durationMinutes: number,
): boolean {
  if (!selected) return false;
  const start = selected.getTime();
  const end = start + durationMinutes * 60_000;
  const slotEnd = slot.getTime() + SLOT_MINUTES * 60_000;
  return slot.getTime() >= start && slot.getTime() < end;
}

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
  const days = useMemo(() => [0, 1, 2].map((offset) => addDays(startOfDay(now), offset)), [now]);

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
    1: '選擇服務時長',
    2: '點選時段，可指定師傅與人數',
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
        <div className="space-y-3">
          {loadingCatalog ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            services.map((service) => {
              const selected = selectedService?.id === service.id;
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => setSelectedService(service)}
                  className={cn(
                    'glass-card w-full p-0 text-left transition active:scale-[0.99]',
                    selected && 'ring-2 ring-primary/60',
                  )}
                >
                  <div className="flex items-center justify-between gap-4 p-5">
                    <div>
                      <p className="text-lg font-bold">{service.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        單次 {formatCurrency(service.price_cash)}
                        {service.price_member != null
                          ? ` · 會員 ${formatCurrency(service.price_member)}`
                          : ''}
                      </p>
                    </div>
                    <ChevronRight className={cn('size-5', selected ? 'text-primary' : 'text-muted-foreground/40')} />
                  </div>
                </button>
              );
            })
          )}
          <div className="pt-4">
            <BindSubmitButton
              type="button"
              disabled={!selectedService}
              onClick={() => setStep(2)}
            >
              下一步
            </BindSubmitButton>
          </div>
        </div>
      ) : null}

      {step === 2 && selectedService ? (
        <div className="space-y-5">
          <Card className="glass-card border-primary/15">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4 text-primary" />
                已選 {selectedService.name}
                {startsAt ? ` · ${formatSelectedDateTime(startsAt)}` : ' · 請點選時段'}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {days.map((day, dayIndex) => (
                  <div key={day.toISOString()} className="min-w-0">
                    <p className="mb-2 text-center text-xs font-semibold text-muted-foreground">
                      {formatDayLabel(day, dayIndex)}
                    </p>
                    <div className="max-h-72 space-y-1 overflow-y-auto pr-0.5">
                      {buildSlotsForDay(day).map((slot) => {
                        const disabled = slotIsPast(slot, now);
                        const selected = startsAt?.getTime() === slot.getTime();
                        const inRange = slotOverlapsSelection(
                          slot,
                          startsAt,
                          selectedService.duration_minutes,
                        );
                        return (
                          <button
                            key={slot.toISOString()}
                            type="button"
                            disabled={disabled}
                            onClick={() => setStartsAt(slot)}
                            className={cn(
                              'w-full rounded-md border px-1 py-2 text-xs font-medium transition',
                              disabled && 'cursor-not-allowed opacity-30',
                              selected && 'border-primary bg-primary text-primary-foreground',
                              inRange && !selected && 'border-primary/40 bg-primary/10 text-primary',
                              !selected && !inRange && !disabled && 'border-border/60 hover:border-primary/30',
                            )}
                          >
                            {formatTimeLabel(slot)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff">師傅</Label>
              <select
                id="staff"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="input-neon h-12 w-full rounded-lg border border-input bg-input/50 px-3 text-base"
              >
                <option value={BOOKING_STAFF_UNASSIGNED}>{BOOKING_STAFF_UNASSIGNED}</option>
                {staffList.map((member) => (
                  <option key={member.id} value={member.display_name}>
                    {member.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="headcount">人數</Label>
              <select
                id="headcount"
                value={headcount}
                onChange={(e) => setHeadcount(Number(e.target.value))}
                className="input-neon h-12 w-full rounded-lg border border-input bg-input/50 px-3 text-base"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} 人
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">備註（選填）</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="傷痛部位、其他需求"
                className="input-neon h-12 border-primary/20 bg-input/50 text-base"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setStep(1)}>
              上一步
            </Button>
            <BindSubmitButton
              type="button"
              className="flex-[2]"
              disabled={!startsAt}
              onClick={() => setStep(3)}
            >
              下一步
            </BindSubmitButton>
          </div>
        </div>
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

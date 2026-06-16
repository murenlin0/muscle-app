'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/phone';
import { cn } from '@/lib/utils';

export interface AppointmentForCheckout {
  id: string;
  clientName: string;
  clientPhone: string;
  clientBalance: number;
  isVip: boolean;
  serviceLabel: string;
  durationMinutes: number;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  staffName: string;
}

export type CheckoutPayment = 'cash' | 'transfer' | 'member';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 把 ISO 轉成 datetime-local 的 value 格式（台北時間） */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** datetime-local value → ISO（解讀為台北時間） */
function localInputToIso(value: string): string {
  if (!value) return '';
  const [datePart, timePart] = value.split('T');
  return `${datePart}T${timePart}:00+08:00`;
}

const PAYMENT_OPTIONS: {
  value: CheckoutPayment;
  label: string;
  color: string;
  activeClass: string;
}[] = [
  {
    value: 'cash',
    label: '現金',
    color: 'text-yellow-400',
    activeClass: 'bg-yellow-500/20 border-yellow-500/60 text-yellow-300',
  },
  {
    value: 'transfer',
    label: '轉帳',
    color: 'text-blue-400',
    activeClass: 'bg-blue-500/20 border-blue-500/60 text-blue-300',
  },
  {
    value: 'member',
    label: '會員使用',
    color: 'text-purple-400',
    activeClass: 'bg-purple-500/20 border-purple-500/60 text-purple-300',
  },
];

export function StaffCheckoutModal({
  appt,
  onClose,
  onComplete,
}: {
  appt: AppointmentForCheckout;
  onClose: () => void;
  onComplete: (paymentMethod: CheckoutPayment) => void;
}) {
  const [newStartsAt, setNewStartsAt] = useState(isoToLocalInput(appt.startsAt));
  const [useMember, setUseMember] = useState(appt.isVip);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [payment, setPayment] = useState<CheckoutPayment>(appt.isVip ? 'member' : 'cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  // 付款方式切到「會員使用」時自動勾選使用會員
  useEffect(() => {
    if (payment === 'member') setUseMember(true);
  }, [payment]);

  const newStartsAtIso = localInputToIso(newStartsAt);
  const newEndsAt = newStartsAtIso
    ? new Date(new Date(newStartsAtIso).getTime() + appt.durationMinutes * 60_000).toISOString()
    : appt.endsAt;

  const topUp = Number(topUpAmount) || 0;
  const balanceAfterTopUp = appt.clientBalance + topUp;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/staff/appointments/${appt.id}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethod: payment,
        useMember,
        topUpAmount: topUp > 0 ? topUp : undefined,
        startsAt: newStartsAtIso || undefined,
      }),
    });

    const data = (await res.json()) as { error?: string; paymentMethod?: CheckoutPayment };
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? '結帳失敗');
      return;
    }

    onComplete(data.paymentMethod ?? payment);
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="glass-card w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
          <div>
            <p className="text-xs text-muted-foreground">{appt.serviceLabel}</p>
            <h2 className="mt-0.5 text-base font-bold">
              {appt.clientName}
              {appt.isVip ? (
                <span className="ml-2 rounded-full border border-primary/50 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  VIP
                </span>
              ) : null}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {appt.clientPhone} · {appt.staffName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* 1. 時間 */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">1. 客人臨時變更時間</Label>
            <Input
              type="datetime-local"
              value={newStartsAt}
              onChange={(e) => setNewStartsAt(e.target.value)}
              className="h-11 bg-input/60"
            />
            {newStartsAtIso && newStartsAtIso !== appt.startsAt ? (
              <p className="text-xs text-primary">
                → {fmtDatetime(newStartsAtIso)} — {fmtTime(newEndsAt)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                原始：{fmtDatetime(appt.startsAt)} — {fmtTime(appt.endsAt)}
              </p>
            )}
          </div>

          {/* 2. 使用會員 */}
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={useMember}
                onChange={(e) => setUseMember(e.target.checked)}
                className="size-4 accent-primary"
              />
              2. 使用會員
            </label>

            {useMember ? (
              <div className="space-y-3 rounded-lg border border-border/60 bg-input/30 px-4 py-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">儲值（師傅 key）</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      className="h-9 bg-input/60 text-center"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">使用（師傅 key）</Label>
                    <Input
                      placeholder="—"
                      disabled
                      className="h-9 cursor-not-allowed bg-input/40 text-center text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="border-t border-border/40 pt-2 text-sm">
                  <span className="text-muted-foreground">目前餘額：</span>
                  <span className="font-semibold text-primary">
                    {formatCurrency(appt.clientBalance)}
                  </span>
                  {topUp > 0 ? (
                    <>
                      <span className="mx-1.5 text-muted-foreground">＋{formatCurrency(topUp)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="ml-1.5 font-bold text-accent">
                        {formatCurrency(balanceAfterTopUp)}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* 3. 付款方式 */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">3. 付款方式</Label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPayment(opt.value)}
                  className={cn(
                    'h-11 rounded-lg border text-sm font-semibold transition',
                    payment === opt.value
                      ? opt.activeClass
                      : 'border-border/60 bg-input/30 text-muted-foreground hover:bg-input/60',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            className="h-12 w-full text-base shadow-md shadow-primary/20"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? '結帳中…' : '完成'}
          </Button>
        </div>
      </div>
    </div>
  );
}

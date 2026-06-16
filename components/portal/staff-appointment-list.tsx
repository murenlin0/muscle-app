'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  StaffCheckoutModal,
  type AppointmentForCheckout,
  type CheckoutPayment,
} from './staff-checkout-modal';

interface RawAppointment {
  id: string;
  service_label: string;
  service_duration_minutes: number;
  starts_at: string;
  ends_at: string;
  status: string;
  note: string | null;
  staff: { id: string; display_name: string } | null;
  client: {
    id: string;
    name: string;
    phone: string;
    balance: number;
    is_vip: boolean;
  } | null;
}

type AppointmentStatus = 'pending_checkout' | 'completed' | 'cancelled';

interface AppointmentItem extends RawAppointment {
  status: AppointmentStatus;
  localPayment?: CheckoutPayment;
}

const PAYMENT_COLORS: Record<CheckoutPayment, string> = {
  cash: 'border-l-yellow-500 bg-yellow-500/10',
  transfer: 'border-l-blue-500 bg-blue-500/10',
  member: 'border-l-purple-500 bg-purple-500/10',
};

const PAYMENT_BADGE: Record<CheckoutPayment, { label: string; cls: string }> = {
  cash: { label: '現金', cls: 'bg-yellow-500/20 text-yellow-300' },
  transfer: { label: '轉帳', cls: 'bg-blue-500/20 text-blue-300' },
  member: { label: '會員', cls: 'bg-purple-500/20 text-purple-300' },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function StaffAppointmentList() {
  const [items, setItems] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AppointmentItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/appointments');
      const data = (await res.json()) as { appointments?: RawAppointment[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? '載入失敗');
      setItems((data.appointments ?? []) as AppointmentItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleComplete(id: string, payment: CheckoutPayment) {
    setItems((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: 'completed', localPayment: payment } : a,
      ),
    );
    setSelected(null);
  }

  function openModal(item: AppointmentItem) {
    if (item.status !== 'pending_checkout') return;
    setSelected(item);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        載入今日預約…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">今日預約</h3>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
          >
            <RefreshCw className="size-3" />
            重整
          </button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            今日尚無預約
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const isPending = item.status === 'pending_checkout';
              const payment = item.localPayment;
              const completedColor = payment ? PAYMENT_COLORS[payment] : 'border-l-emerald-500 bg-emerald-500/10';
              const cardClass = isPending
                ? 'border-l-zinc-500 bg-zinc-500/10 cursor-pointer hover:bg-zinc-500/20 active:scale-[0.99]'
                : completedColor;

              return (
                <div
                  key={item.id}
                  role={isPending ? 'button' : undefined}
                  tabIndex={isPending ? 0 : undefined}
                  onClick={() => openModal(item)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openModal(item); }}
                  className={cn(
                    'relative flex items-start gap-3 rounded-xl border border-border/60 border-l-4 px-4 py-3.5 transition',
                    cardClass,
                  )}
                >
                  {/* 時間 */}
                  <div className="w-14 shrink-0 text-xs font-mono text-muted-foreground">
                    <p>{fmtTime(item.starts_at)}</p>
                    <p>{fmtTime(item.ends_at)}</p>
                  </div>

                  {/* 內容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-sm">
                        {item.client?.name ?? '未知客人'}
                      </span>
                      {item.client?.is_vip ? (
                        <span className="rounded-full border border-primary/40 px-1.5 text-[10px] font-medium text-primary">
                          VIP
                        </span>
                      ) : null}
                      {payment ? (
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PAYMENT_BADGE[payment].cls)}>
                          {PAYMENT_BADGE[payment].label}
                        </span>
                      ) : null}
                      {isPending ? (
                        <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                          待結帳
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.service_label} · {item.client?.phone}
                    </p>
                    {item.note ? (
                      <p className="mt-0.5 text-xs text-muted-foreground/70 italic">{item.note}</p>
                    ) : null}
                  </div>

                  {isPending ? (
                    <div className="text-xs text-muted-foreground/60 self-center">點擊結帳 →</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected ? (
        <StaffCheckoutModal
          appt={{
            id: selected.id,
            clientName: selected.client?.name ?? '未知',
            clientPhone: selected.client?.phone ?? '',
            clientBalance: selected.client?.balance ?? 0,
            isVip: selected.client?.is_vip ?? false,
            serviceLabel: selected.service_label,
            durationMinutes: selected.service_duration_minutes,
            startsAt: selected.starts_at,
            endsAt: selected.ends_at,
            staffName: selected.staff?.display_name ?? '',
          }}
          onClose={() => setSelected(null)}
          onComplete={(p) => handleComplete(selected.id, p)}
        />
      ) : null}
    </>
  );
}

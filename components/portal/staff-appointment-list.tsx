'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { formatStoreDateIso, shiftStoreDateIso } from '@/lib/store-timezone';
import {
  StaffCheckoutModal,
  type CheckoutPayment,
} from './staff-checkout-modal';
import { StaffDayCalendar } from './staff-day-calendar';

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

function todayIso() {
  return formatStoreDateIso(new Date());
}

function formatDateLabel(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00+08:00`);
  const weekday = d.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
  });
  const md = d.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
  });
  const isToday = isoDate === todayIso();
  return `${md} ${weekday}${isToday ? '（今天）' : ''}`;
}

export function StaffAppointmentList({ initialDate }: { initialDate?: string }) {
  const [viewDate, setViewDate] = useState(initialDate ?? todayIso());
  const [items, setItems] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AppointmentItem | null>(null);

  useEffect(() => {
    if (initialDate) setViewDate(initialDate);
  }, [initialDate]);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/appointments?date=${encodeURIComponent(date)}`);
      const data = (await res.json()) as { appointments?: RawAppointment[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? '載入失敗');
      setItems((data.appointments ?? []) as AppointmentItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(viewDate);
  }, [load, viewDate]);

  const calendarItems = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        clientName: item.client?.name ?? '未知客人',
        serviceLabel: item.service_label,
        startsAt: item.starts_at,
        endsAt: item.ends_at,
        durationMinutes: item.service_duration_minutes,
        status: item.status,
        localPayment: item.localPayment,
      })),
    [items],
  );

  function handleComplete(id: string, payment: CheckoutPayment) {
    setItems((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: 'completed', localPayment: payment } : a,
      ),
    );
    setSelected(null);
  }

  function openModal(id: string) {
    const item = items.find((a) => a.id === id);
    if (!item || item.status !== 'pending_checkout') return;
    setSelected(item);
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">預約日曆</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              灰色方塊為待結帳，點擊可結帳
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewDate((d) => shiftStoreDateIso(d, -1))}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              aria-label="前一天"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[8rem] text-center text-sm font-medium">
              {formatDateLabel(viewDate)}
            </span>
            <button
              type="button"
              onClick={() => setViewDate((d) => shiftStoreDateIso(d, 1))}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              aria-label="後一天"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => void load(viewDate)}
              className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
            >
              <RefreshCw className="size-3" />
              重整
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            載入預約中…
          </div>
        ) : error ? (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <>
            <StaffDayCalendar appointments={calendarItems} onSelect={openModal} />
            {calendarItems.length === 0 ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {viewDate === todayIso() ? '今天尚無預約' : '此日期尚無預約'} · 可用左右箭頭切換日期
              </p>
            ) : null}
          </>
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

'use client';

import {
  BOOKING_CLOSE_HOUR,
  BOOKING_OPEN_HOUR,
  bookingHourLabel,
} from '@/lib/booking-hours';
import { cn } from '@/lib/utils';
import type { CheckoutPayment } from './staff-checkout-modal';

const HOUR_HEIGHT_PX = 48;

export interface CalendarAppointment {
  id: string;
  clientName: string;
  serviceLabel: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: 'pending_checkout' | 'completed' | 'cancelled';
  localPayment?: CheckoutPayment;
}

const BLOCK_COLORS = {
  pending: 'border-zinc-400/80 bg-zinc-500/25 text-zinc-100',
  cash: 'border-yellow-500/80 bg-yellow-500/25 text-yellow-100',
  transfer: 'border-blue-500/80 bg-blue-500/25 text-blue-100',
  member: 'border-purple-500/80 bg-purple-500/25 text-purple-100',
  completed: 'border-emerald-500/80 bg-emerald-500/25 text-emerald-100',
} as const;

function minutesFromOpen(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute - BOOKING_OPEN_HOUR * 60;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function blockColor(appt: CalendarAppointment) {
  if (appt.status === 'pending_checkout') return BLOCK_COLORS.pending;
  if (appt.localPayment === 'cash') return BLOCK_COLORS.cash;
  if (appt.localPayment === 'transfer') return BLOCK_COLORS.transfer;
  if (appt.localPayment === 'member') return BLOCK_COLORS.member;
  return BLOCK_COLORS.completed;
}

export function StaffDayCalendar({
  appointments,
  onSelect,
}: {
  appointments: CalendarAppointment[];
  onSelect: (id: string) => void;
}) {
  const totalMinutes = (BOOKING_CLOSE_HOUR - BOOKING_OPEN_HOUR) * 60;
  const gridHeightPx = (totalMinutes / 60) * HOUR_HEIGHT_PX;
  const hours = Array.from(
    { length: BOOKING_CLOSE_HOUR - BOOKING_OPEN_HOUR },
    (_, i) => BOOKING_OPEN_HOUR + i,
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-input/20">
      <div className="flex">
        {/* 時間軸 */}
        <div className="relative w-16 shrink-0 border-r border-border/40 bg-background/40">
          <div style={{ height: gridHeightPx }} className="relative">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground"
                style={{ top: ((hour - BOOKING_OPEN_HOUR) / (BOOKING_CLOSE_HOUR - BOOKING_OPEN_HOUR)) * gridHeightPx }}
              >
                {bookingHourLabel(hour)}
              </div>
            ))}
          </div>
        </div>

        {/* 格線 + 預約方塊 */}
        <div className="relative min-h-0 flex-1">
          <div style={{ height: gridHeightPx }} className="relative">
            {Array.from({ length: BOOKING_CLOSE_HOUR - BOOKING_OPEN_HOUR + 1 }, (_, i) => (
              <div
                key={i}
                className="absolute inset-x-0 border-t border-border/30"
                style={{ top: (i / (BOOKING_CLOSE_HOUR - BOOKING_OPEN_HOUR)) * gridHeightPx }}
              />
            ))}

            {appointments.map((appt) => {
              const topMinutes = minutesFromOpen(appt.startsAt);
              const topPx = (topMinutes / 60) * HOUR_HEIGHT_PX;
              const heightPx = Math.max((appt.durationMinutes / 60) * HOUR_HEIGHT_PX, 28);
              const isPending = appt.status === 'pending_checkout';

              return (
                <button
                  key={appt.id}
                  type="button"
                  disabled={!isPending}
                  onClick={() => onSelect(appt.id)}
                  className={cn(
                    'absolute inset-x-2 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm transition',
                    blockColor(appt),
                    isPending
                      ? 'cursor-pointer hover:brightness-110 active:scale-[0.99]'
                      : 'cursor-default opacity-95',
                  )}
                  style={{ top: topPx, height: heightPx }}
                >
                  <p className="truncate font-semibold">{appt.clientName}</p>
                  <p className="truncate opacity-90">{appt.serviceLabel}</p>
                  <p className="truncate font-mono text-[10px] opacity-80">
                    {fmtTime(appt.startsAt)} – {fmtTime(appt.endsAt)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

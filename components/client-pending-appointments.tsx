'use client';

import { CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ClientPendingAppointment {
  id: string;
  service_label: string;
  service_duration_minutes: number;
  starts_at: string;
  ends_at: string;
  note: string | null;
  staff: { display_name: string } | null;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function ClientPendingAppointments({
  appointments,
}: {
  appointments: ClientPendingAppointment[];
}) {
  if (appointments.length === 0) {
    return (
      <div className="neon-panel px-4 py-8 text-center text-sm text-muted-foreground">
        目前沒有待結帳的預約
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {appointments.map((appt) => (
        <div
          key={appt.id}
          className={cn(
            'neon-panel flex gap-3 border-l-4 border-l-zinc-400/80 px-4 py-3.5',
          )}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-400/30 bg-zinc-500/10 text-zinc-300">
            <CalendarClock className="size-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">{appt.service_label}</p>
              <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                待結帳
              </span>
            </div>
            <p className="mt-1 text-sm text-primary">{fmtDateTime(appt.starts_at)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fmtTime(appt.starts_at)} – {fmtTime(appt.ends_at)} · {appt.service_duration_minutes} 分
              {appt.staff?.display_name ? ` · 師傅 ${appt.staff.display_name}` : ''}
            </p>
            {appt.note ? (
              <p className="mt-1 text-xs italic text-muted-foreground/80">{appt.note}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

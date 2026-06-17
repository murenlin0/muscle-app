'use client';

import { CalendarTimePicker } from '@/components/booking/calendar-time-picker';
import { ServicePriceLines } from '@/components/booking/service-price-lines';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  serviceDurationLabel,
  servicePriceDisplay,
} from '@/lib/booking-services';
import type { Client, Service } from '@/lib/types/database';

function formatSelectedTime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

export function TimeStep({
  service,
  client,
  startsAt,
  now,
  note,
  onSelectSlot,
  onNoteChange,
}: {
  service: Service;
  client: Client;
  startsAt: Date | null;
  now: Date;
  note: string;
  onSelectSlot: (slot: Date) => void;
  onNoteChange: (value: string) => void;
}) {
  const prices = servicePriceDisplay(service, client);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">選擇時間</h2>

      <div className="neon-outline-card-selected px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{service.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {serviceDurationLabel(service)}
            </p>
            <p className="mt-2 text-xs text-foreground/90">
              {startsAt ? formatSelectedTime(startsAt) : '請在下方選擇時段'}
            </p>
          </div>
          <ServicePriceLines prices={prices} align="right" />
        </div>
      </div>

      <CalendarTimePicker
        durationMinutes={service.duration_minutes}
        value={startsAt}
        now={now}
        onChange={onSelectSlot}
      />

      <div className="neon-panel space-y-2 p-4">
        <Label htmlFor="note" className="text-muted-foreground">
          備註（選填）
        </Label>
        <Input
          id="note"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="其他需求"
          className="neon-field h-12 border-primary/30 bg-input/40 text-base"
        />
      </div>
    </div>
  );
}

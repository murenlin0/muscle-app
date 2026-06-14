'use client';

import { CalendarTimePicker } from '@/components/booking/calendar-time-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BOOKING_STAFF_UNASSIGNED } from '@/lib/booking-draft';
import {
  serviceDurationLabel,
  servicePriceDisplay,
} from '@/lib/booking-services';
import type { Client, Service, Staff } from '@/lib/types/database';

export function TimeStep({
  service,
  client,
  startsAt,
  now,
  staffList,
  staffName,
  headcount,
  note,
  onSelectSlot,
  onStaffChange,
  onHeadcountChange,
  onNoteChange,
}: {
  service: Service;
  client: Client;
  startsAt: Date | null;
  now: Date;
  staffList: Staff[];
  staffName: string;
  headcount: number;
  note: string;
  onSelectSlot: (slot: Date) => void;
  onStaffChange: (name: string) => void;
  onHeadcountChange: (count: number) => void;
  onNoteChange: (value: string) => void;
}) {
  const prices = servicePriceDisplay(service, client);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">選擇時間</h2>

      <div className="neon-outline-card-selected px-4 py-3">
        <p className="text-sm font-semibold">{service.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {serviceDurationLabel(service)}
        </p>
        <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-primary">
          {prices.estimatedLabel}
        </p>
      </div>

      <CalendarTimePicker
        durationMinutes={service.duration_minutes}
        value={startsAt}
        now={now}
        onChange={onSelectSlot}
      />

      <div className="neon-panel space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="staff" className="text-muted-foreground">
            師傅
          </Label>
          <select
            id="staff"
            value={staffName}
            onChange={(e) => onStaffChange(e.target.value)}
            className="neon-field h-12 w-full px-3"
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
          <Label htmlFor="headcount" className="text-muted-foreground">
            人數
          </Label>
          <select
            id="headcount"
            value={headcount}
            onChange={(e) => onHeadcountChange(Number(e.target.value))}
            className="neon-field h-12 w-full px-3"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} 人
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="note" className="text-muted-foreground">
            備註（選填）
          </Label>
          <Input
            id="note"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="傷痛部位、其他需求"
            className="neon-field h-12 border-primary/30 bg-input/40 text-base"
          />
        </div>
      </div>
    </div>
  );
}

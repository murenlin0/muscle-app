'use client';

import { CalendarTimePicker } from '@/components/booking/calendar-time-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BOOKING_STAFF_UNASSIGNED } from '@/lib/booking-draft';
import { serviceDurationLabel } from '@/lib/booking-services';
import type { Service, Staff } from '@/lib/types/database';

export function TimeStep({
  service,
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
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">選擇時間</h2>
      <p className="-mt-3 text-sm text-muted-foreground">
        已選：{service.name} · {serviceDurationLabel(service)}
      </p>

      <CalendarTimePicker
        durationMinutes={service.duration_minutes}
        value={startsAt}
        now={now}
        onChange={onSelectSlot}
      />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="staff">師傅</Label>
          <select
            id="staff"
            value={staffName}
            onChange={(e) => onStaffChange(e.target.value)}
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
            onChange={(e) => onHeadcountChange(Number(e.target.value))}
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
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="傷痛部位、其他需求"
            className="input-neon h-12 border-primary/20 bg-input/50 text-base"
          />
        </div>
      </div>
    </div>
  );
}

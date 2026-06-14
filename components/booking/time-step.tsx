'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BOOKING_STAFF_UNASSIGNED } from '@/lib/booking-draft';
import { serviceDurationLabel } from '@/lib/booking-services';
import type { Service, Staff } from '@/lib/types/database';
import { cn } from '@/lib/utils';

const OPEN_HOUR = 10;
const CLOSE_HOUR = 21;
const SLOT_MINUTES = 30;

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
  return slot.getTime() >= start && slot.getTime() < end;
}

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
  const days = useMemo(
    () => [0, 1, 2].map((offset) => addDays(startOfDay(now), offset)),
    [now],
  );
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  useEffect(() => {
    if (!startsAt) return;
    const index = days.findIndex(
      (day) => startOfDay(day).getTime() === startOfDay(startsAt).getTime(),
    );
    if (index >= 0) setActiveDayIndex(index);
  }, [startsAt, days]);

  const activeDay = days[activeDayIndex] ?? days[0];
  const slots = buildSlotsForDay(activeDay);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold">選擇時間與師傅</h2>
      <p className="-mt-3 text-sm text-muted-foreground">
        已選：{service.name} · {serviceDurationLabel(service)}
      </p>

      <Card className="glass-card border-primary/15">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4 text-primary" />
            {startsAt ? formatSelectedDateTime(startsAt) : '請選擇開始時間'}
          </div>
          <div className="mt-3 flex gap-2">
            {days.map((day, dayIndex) => (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setActiveDayIndex(dayIndex)}
                className={cn(
                  'flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition',
                  activeDayIndex === dayIndex
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/30',
                )}
              >
                {formatDayLabel(day, dayIndex)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            {slots.map((slot) => {
              const disabled = slotIsPast(slot, now);
              const selected = startsAt?.getTime() === slot.getTime();
              const inRange = slotOverlapsSelection(slot, startsAt, service.duration_minutes);
              return (
                <button
                  key={slot.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectSlot(slot)}
                  className={cn(
                    'rounded-lg border px-1 py-2.5 text-xs font-semibold tabular-nums transition',
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
          {startsAt ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              預約時長 {service.duration_minutes} 分鐘
            </p>
          ) : null}
        </CardContent>
      </Card>

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

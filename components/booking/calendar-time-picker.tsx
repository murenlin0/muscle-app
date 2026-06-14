'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPEN_HOUR = 10;
const CLOSE_HOUR = 21;
const SNAP_MINUTES = 15;
const HOUR_HEIGHT_PX = 56;
const MAX_BOOKING_DAYS = 30;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatHourLabel(hour: number): string {
  if (hour < 12) return `上午${hour}時`;
  if (hour === 12) return '下午12時';
  return `下午${hour - 12}時`;
}

function formatTimeRange(start: Date, durationMinutes: number): string {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function snapMinutes(value: number): number {
  return Math.round(value / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesToDate(day: Date, minutesFromOpen: number): Date {
  const d = startOfDay(day);
  const total = OPEN_HOUR * 60 + minutesFromOpen;
  d.setHours(Math.floor(total / 60), total % 60, 0, 0);
  return d;
}

function dateToMinutesFromOpen(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() - OPEN_HOUR * 60;
}

function defaultStartMinutes(day: Date, now: Date, durationMinutes: number): number {
  const maxStart = (CLOSE_HOUR - OPEN_HOUR) * 60 - durationMinutes;
  let minutes = 0;
  if (startOfDay(day).getTime() === startOfDay(now).getTime()) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes() - OPEN_HOUR * 60;
    minutes = snapMinutes(Math.max(0, nowMinutes + SNAP_MINUTES));
  }
  return Math.min(Math.max(0, minutes), maxStart);
}

export function CalendarTimePicker({
  durationMinutes,
  value,
  now,
  onChange,
}: {
  durationMinutes: number;
  value: Date | null;
  now: Date;
  onChange: (date: Date) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [selectedDay, setSelectedDay] = useState(() =>
    startOfDay(value ?? now),
  );
  const [startMinutes, setStartMinutes] = useState(() =>
    value
      ? dateToMinutesFromOpen(value)
      : defaultStartMinutes(selectedDay, now, durationMinutes),
  );
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const dragRef = useRef<{ startY: number; startMinutes: number } | null>(null);

  const totalMinutes = (CLOSE_HOUR - OPEN_HOUR) * 60;
  const maxStartMinutes = totalMinutes - durationMinutes;
  const blockHeightPx = (durationMinutes / 60) * HOUR_HEIGHT_PX;
  const gridHeightPx = (totalMinutes / 60) * HOUR_HEIGHT_PX;
  const hours = useMemo(
    () => Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i),
    [],
  );

  const minDay = startOfDay(now);
  const maxDay = addDays(minDay, MAX_BOOKING_DAYS);

  const clampMinutes = useCallback(
    (m: number) => Math.min(Math.max(0, snapMinutes(m)), maxStartMinutes),
    [maxStartMinutes],
  );

  const applyMinutes = useCallback(
    (minutes: number) => {
      const clamped = clampMinutes(minutes);
      setStartMinutes(clamped);
      onChange(minutesToDate(selectedDay, clamped));
    },
    [clampMinutes, onChange, selectedDay],
  );

  useEffect(() => {
    if (value) {
      setSelectedDay(startOfDay(value));
      setStartMinutes(dateToMinutesFromOpen(value));
    }
  }, [value]);

  useEffect(() => {
    if (value) return;
    const day = startOfDay(now);
    const mins = defaultStartMinutes(day, now, durationMinutes);
    setSelectedDay(day);
    setStartMinutes(mins);
    onChange(minutesToDate(day, mins));
  }, [durationMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyMinutes(startMinutes);
  }, [durationMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  function shiftDay(delta: number) {
    const next = addDays(selectedDay, delta);
    if (next.getTime() < minDay.getTime() || next.getTime() > maxDay.getTime()) return;
    setSelectedDay(next);
    const mins = defaultStartMinutes(next, now, durationMinutes);
    applyMinutes(mins);
    setDateMenuOpen(false);
  }

  function pickDay(day: Date) {
    setSelectedDay(day);
    applyMinutes(defaultStartMinutes(day, now, durationMinutes));
    setDateMenuOpen(false);
  }

  function yToMinutes(clientY: number): number {
    const grid = gridRef.current;
    if (!grid) return startMinutes;
    const rect = grid.getBoundingClientRect();
    const y = clientY - rect.top;
    const ratio = y / gridHeightPx;
    return clampMinutes(ratio * totalMinutes);
  }

  function onGridPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('[data-drag-block]')) return;
    applyMinutes(yToMinutes(e.clientY));
  }

  function onBlockPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startMinutes: startMinutes };
  }

  function onBlockPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const deltaY = e.clientY - dragRef.current.startY;
    const deltaMinutes = (deltaY / HOUR_HEIGHT_PX) * 60;
    applyMinutes(dragRef.current.startMinutes + deltaMinutes);
  }

  function onBlockPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const weekdayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const upcomingDays = useMemo(() => {
    const list: Date[] = [];
    for (let i = 0; i <= MAX_BOOKING_DAYS; i++) {
      list.push(addDays(minDay, i));
    }
    return list;
  }, [minDay]);

  const currentStart = minutesToDate(selectedDay, startMinutes);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/30">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            disabled={selectedDay.getTime() <= minDay.getTime()}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground disabled:opacity-30"
            aria-label="前一天"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setDateMenuOpen((o) => !o)}
              className="flex items-center gap-0.5 text-base font-semibold"
            >
              {selectedDay.getMonth() + 1}月
              <ChevronDown
                className={cn('size-4 text-muted-foreground transition', dateMenuOpen && 'rotate-180')}
              />
            </button>
            {dateMenuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40"
                  aria-label="關閉日期選單"
                  onClick={() => setDateMenuOpen(false)}
                />
                <div className="absolute left-0 top-full z-50 mt-2 max-h-52 w-44 overflow-y-auto rounded-xl border border-border/70 bg-card py-1 shadow-xl">
                  {upcomingDays.map((day) => {
                    const active = day.getTime() === selectedDay.getTime();
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => pickDay(day)}
                        className={cn(
                          'flex w-full px-3 py-2 text-left text-sm transition hover:bg-muted/50',
                          active && 'bg-primary/15 text-primary',
                        )}
                      >
                        {day.getMonth() + 1}/{day.getDate()} {weekdayLabels[day.getDay()]}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            disabled={selectedDay.getTime() >= maxDay.getTime()}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground disabled:opacity-30"
            aria-label="後一天"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <p className="mt-3 text-3xl font-normal text-muted-foreground">
          {weekdayLabels[selectedDay.getDay()]}{' '}
          <span className="text-4xl text-foreground">{selectedDay.getDate()}</span>
        </p>
      </div>

      <div className="relative flex max-h-[420px] overflow-y-auto">
        <div className="w-16 shrink-0 border-r border-border/40 pt-2">
          {hours.map((hour) => (
            <div
              key={hour}
              className="pr-2 text-right text-[11px] leading-none text-muted-foreground"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              <span className="relative -top-2">{formatHourLabel(hour)}</span>
            </div>
          ))}
        </div>

        <div
          ref={gridRef}
          className="relative flex-1 touch-none select-none"
          style={{ height: gridHeightPx }}
          onPointerDown={onGridPointerDown}
        >
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-border/35"
              style={{ top: (hour - OPEN_HOUR) * HOUR_HEIGHT_PX }}
            />
          ))}

          <div
            data-drag-block
            role="slider"
            aria-label="拖曳選擇開始時間"
            aria-valuetext={formatTimeRange(currentStart, durationMinutes)}
            className="absolute left-2 right-2 cursor-grab rounded-md border-2 border-foreground/70 bg-primary/12 active:cursor-grabbing"
            style={{
              top: (startMinutes / 60) * HOUR_HEIGHT_PX,
              height: blockHeightPx,
            }}
            onPointerDown={onBlockPointerDown}
            onPointerMove={onBlockPointerMove}
            onPointerUp={onBlockPointerUp}
            onPointerCancel={onBlockPointerUp}
          >
            <span className="absolute -left-1 -top-1 size-2.5 rounded-full border-2 border-foreground/80 bg-background" />
            <span className="absolute -bottom-1 -right-1 size-2.5 rounded-full border-2 border-foreground/80 bg-background" />
            <div className="px-2 py-1 text-xs font-medium text-foreground/90">
              {formatTimeRange(currentStart, durationMinutes)}
            </div>
          </div>
        </div>
      </div>

      <p className="border-t border-border/40 px-4 py-2 text-center text-xs text-muted-foreground">
        拖曳方框或點擊時段 · 時長 {durationMinutes} 分鐘
      </p>
    </div>
  );
}

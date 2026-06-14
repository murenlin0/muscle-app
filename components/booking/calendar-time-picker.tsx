'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BOOKING_CLOSE_HOUR,
  BOOKING_MIN_LEAD_MINUTES,
  BOOKING_OPEN_HOUR,
  bookingHourLabel,
} from '@/lib/booking-hours';
import { cn } from '@/lib/utils';

const SNAP_MINUTES = 15;
const HOUR_HEIGHT_PX = 48;
const MAX_BOOKING_DAYS = 30;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
  const total = BOOKING_OPEN_HOUR * 60 + minutesFromOpen;
  d.setHours(Math.floor(total / 60), total % 60, 0, 0);
  return d;
}

function dateToMinutesFromOpen(date: Date): number {
  return date.getHours() * 60 + date.getMinutes() - BOOKING_OPEN_HOUR * 60;
}

function minStartMinutesForDay(day: Date, now: Date): number {
  if (startOfDay(day).getTime() !== startOfDay(now).getTime()) return 0;
  const nowMinutes =
    now.getHours() * 60 + now.getMinutes() - BOOKING_OPEN_HOUR * 60;
  return snapMinutes(Math.max(0, nowMinutes + BOOKING_MIN_LEAD_MINUTES));
}

function maxStartMinutesForDuration(durationMinutes: number): number {
  return (BOOKING_CLOSE_HOUR - BOOKING_OPEN_HOUR) * 60 - durationMinutes;
}

function defaultStartMinutes(day: Date, now: Date, durationMinutes: number): number {
  const maxStart = maxStartMinutesForDuration(durationMinutes);
  const minStart = minStartMinutesForDay(day, now);
  return Math.min(Math.max(minStart, 0), maxStart);
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
  const [startMinutes, setStartMinutes] = useState(() => {
    if (value) return dateToMinutesFromOpen(value);
    return defaultStartMinutes(startOfDay(value ?? now), now, durationMinutes);
  });
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startMinutes: number; pointerId: number } | null>(
    null,
  );

  const totalMinutes = (BOOKING_CLOSE_HOUR - BOOKING_OPEN_HOUR) * 60;
  const maxStartMinutes = maxStartMinutesForDuration(durationMinutes);
  const minStartMinutes = minStartMinutesForDay(selectedDay, now);
  const blockHeightPx = (durationMinutes / 60) * HOUR_HEIGHT_PX;
  const gridHeightPx = (totalMinutes / 60) * HOUR_HEIGHT_PX;

  const hours = useMemo(
    () =>
      Array.from(
        { length: BOOKING_CLOSE_HOUR - BOOKING_OPEN_HOUR },
        (_, i) => BOOKING_OPEN_HOUR + i,
      ),
    [],
  );

  const minDay = startOfDay(now);
  const maxDay = addDays(minDay, MAX_BOOKING_DAYS);

  const clampMinutes = useCallback(
    (m: number) =>
      Math.min(Math.max(minStartMinutes, snapMinutes(m)), maxStartMinutes),
    [minStartMinutes, maxStartMinutes],
  );

  const applyMinutes = useCallback(
    (minutes: number, day: Date = selectedDay) => {
      const clamped = clampMinutes(minutes);
      setSelectedDay(day);
      setStartMinutes(clamped);
      onChange(minutesToDate(day, clamped));
    },
    [clampMinutes, onChange, selectedDay],
  );

  useEffect(() => {
    if (value) {
      setSelectedDay(startOfDay(value));
      setStartMinutes(clampMinutes(dateToMinutesFromOpen(value)));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (value) return;
    const day = startOfDay(now);
    const mins = defaultStartMinutes(day, now, durationMinutes);
    setSelectedDay(day);
    setStartMinutes(mins);
    onChange(minutesToDate(day, mins));
  }, [durationMinutes, now]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyMinutes(startMinutes);
  }, [durationMinutes, minStartMinutes, maxStartMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: PointerEvent) {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
      e.preventDefault();
      const deltaY = e.clientY - dragRef.current.startY;
      const deltaMinutes = (deltaY / HOUR_HEIGHT_PX) * 60;
      applyMinutes(dragRef.current.startMinutes + deltaMinutes);
    }

    function onUp(e: PointerEvent) {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
      dragRef.current = null;
      setDragging(false);
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.overflow = prevOverflow;
    };
  }, [dragging, applyMinutes]);

  function shiftDay(delta: number) {
    const next = addDays(selectedDay, delta);
    if (next.getTime() < minDay.getTime() || next.getTime() > maxDay.getTime()) return;
    applyMinutes(defaultStartMinutes(next, now, durationMinutes), next);
    setDateMenuOpen(false);
  }

  function pickDay(day: Date) {
    applyMinutes(defaultStartMinutes(day, now, durationMinutes), day);
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
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startY: e.clientY,
      startMinutes: startMinutes,
      pointerId: e.pointerId,
    };
    setDragging(true);
  }

  function onBlockPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onBlockPointerUp(e: React.PointerEvent) {
    if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
    e.preventDefault();
    dragRef.current = null;
    setDragging(false);
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
  const isToday = startOfDay(selectedDay).getTime() === minDay.getTime();

  return (
    <div className="neon-panel overflow-hidden">
      <div className="relative z-20 border-b border-primary/20 px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            disabled={selectedDay.getTime() <= minDay.getTime()}
            className="rounded-xl p-2.5 text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-primary disabled:opacity-30"
            aria-label="前一天"
          >
            <ChevronLeft className="size-7" strokeWidth={2.5} />
          </button>
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setDateMenuOpen((o) => !o)}
              className="flex items-center gap-0.5 rounded-lg px-1 py-0.5 text-base font-semibold transition-colors duration-200 hover:text-primary"
            >
              {selectedDay.getMonth() + 1}月
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition',
                  dateMenuOpen && 'rotate-180 text-primary',
                )}
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
                <div className="absolute left-0 top-full z-50 mt-2 max-h-52 w-44 overflow-y-auto rounded-xl border border-primary/35 bg-card py-1 shadow-[0_8px_32px_oklch(0_0_0/0.55)]">
                  {upcomingDays.map((day) => {
                    const active = day.getTime() === selectedDay.getTime();
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          pickDay(day);
                        }}
                        className={cn(
                          'flex w-full px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-primary/10 hover:text-primary',
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
            className="rounded-xl p-2.5 text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-primary disabled:opacity-30"
            aria-label="後一天"
          >
            <ChevronRight className="size-7" strokeWidth={2.5} />
          </button>
        </div>
        <p className="mt-3 text-3xl font-normal text-muted-foreground">
          {weekdayLabels[selectedDay.getDay()]}{' '}
          <span className="text-4xl text-foreground">{selectedDay.getDate()}</span>
        </p>
      </div>

      <div className="relative flex overflow-x-hidden">
        <div
          className="w-[4.5rem] shrink-0 border-r border-primary/15 pt-2"
          style={{ height: gridHeightPx }}
        >
          {hours.map((hour) => (
            <div
              key={hour}
              className="relative pr-2 text-right text-[11px] leading-none text-muted-foreground"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              <span className="absolute right-2 -top-2 whitespace-nowrap">
                {bookingHourLabel(hour)}
              </span>
            </div>
          ))}
          <div className="relative h-0">
            <span className="absolute right-2 -top-2 whitespace-nowrap text-[11px] text-muted-foreground">
              {bookingHourLabel(BOOKING_CLOSE_HOUR)}
            </span>
          </div>
        </div>

        <div
          ref={gridRef}
          className="relative flex-1 select-none"
          style={{ height: gridHeightPx }}
          onPointerDown={onGridPointerDown}
        >
          {Array.from({ length: BOOKING_CLOSE_HOUR - BOOKING_OPEN_HOUR + 1 }, (_, i) => (
            <div
              key={BOOKING_OPEN_HOUR + i}
              className="absolute left-0 right-0 border-t border-primary/12"
              style={{ top: i * HOUR_HEIGHT_PX }}
            />
          ))}

          <div
            data-drag-block
            role="slider"
            aria-label="拖曳選擇開始時間"
            aria-valuemin={minStartMinutes}
            aria-valuemax={maxStartMinutes}
            aria-valuetext={formatTimeRange(currentStart, durationMinutes)}
            className="absolute left-1 right-1 cursor-grab rounded-md border-2 border-primary/75 bg-primary/12 touch-none transition-colors duration-200 hover:border-primary hover:bg-primary/18 active:cursor-grabbing"
            style={{
              top: (startMinutes / 60) * HOUR_HEIGHT_PX,
              height: blockHeightPx,
            }}
            onPointerDown={onBlockPointerDown}
            onPointerMove={onBlockPointerMove}
            onPointerUp={onBlockPointerUp}
            onPointerCancel={onBlockPointerUp}
          >
            <div className="px-2 py-1 text-xs font-medium text-foreground/90">
              {formatTimeRange(currentStart, durationMinutes)}
            </div>
          </div>
        </div>
      </div>

      <p className="border-t border-primary/15 px-4 py-2 text-center text-xs text-muted-foreground">
        拖曳方框或點擊時段 · 時長 {durationMinutes} 分鐘
        {isToday ? ` · 最早 ${BOOKING_MIN_LEAD_MINUTES} 分鐘後` : ''}
      </p>
    </div>
  );
}

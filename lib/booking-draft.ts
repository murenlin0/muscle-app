import { formatBookingMessage, type BookingMessageData } from '@/lib/booking-message';
import { stripAllSpaces } from '@/lib/phone';
import type { StoreSlug } from '@/lib/stores';

export const BOOKING_STAFF_UNASSIGNED = '不指定';

export function serviceItemLabel(durationMinutes: number): string {
  return `運動按摩 ${durationMinutes}min`;
}

export function buildBookingNote(input: {
  headcount: number;
  staffName: string;
  note: string;
}): string | null {
  const parts: string[] = [];
  if (input.headcount > 1) parts.push(`${input.headcount}人`);
  if (input.staffName !== BOOKING_STAFF_UNASSIGNED) {
    parts.push(`偏好${input.staffName}師傅`);
  }
  const trimmed = input.note.trim();
  if (trimmed) parts.push(trimmed);
  return parts.length ? parts.join('；') : null;
}

export function buildBookingDraft(input: {
  storeSlug: StoreSlug;
  storeLabel: string;
  staffName: string;
  clientName: string;
  phone: string;
  durationMinutes: number;
  startsAt: Date;
  headcount: number;
  note: string;
}): BookingMessageData {
  return {
    storeSlug: input.storeSlug,
    storeLabel: input.storeLabel,
    staffName: input.staffName,
    clientName: stripAllSpaces(input.clientName),
    phone: stripAllSpaces(input.phone),
    serviceLabel: serviceItemLabel(input.durationMinutes),
    durationMinutes: input.durationMinutes,
    startsAt: input.startsAt,
    note: buildBookingNote({
      headcount: input.headcount,
      staffName: input.staffName,
      note: input.note,
    }),
  };
}

export function buildBookingMessageText(draft: BookingMessageData): string {
  return formatBookingMessage(draft);
}

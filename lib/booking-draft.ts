import { formatBookingMessage, type BookingMessageData } from '@/lib/booking-message';
import { bookingServiceLabel } from '@/lib/booking-services';
import { stripAllSpaces } from '@/lib/phone';
import type { StoreSlug } from '@/lib/stores';

export function buildBookingDraft(input: {
  storeSlug: StoreSlug;
  storeLabel: string;
  clientName: string;
  phone: string;
  durationMinutes: number;
  startsAt: Date;
  note: string;
}): BookingMessageData {
  const trimmedNote = input.note.trim();
  return {
    storeSlug: input.storeSlug,
    storeLabel: input.storeLabel,
    clientName: stripAllSpaces(input.clientName),
    phone: stripAllSpaces(input.phone),
    serviceLabel: bookingServiceLabel(input.durationMinutes),
    durationMinutes: input.durationMinutes,
    startsAt: input.startsAt,
    note: trimmedNote || null,
  };
}

export function buildBookingMessageText(draft: BookingMessageData): string {
  return formatBookingMessage(draft);
}

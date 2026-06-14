import type { Client, Service } from '@/lib/types/database';
import { formatCurrency } from '@/lib/phone';

/** 預約訊息與師傅端解析用的項目字串 */
export function bookingServiceLabel(durationMinutes: number): string {
  return `運動按摩 ${durationMinutes}min`;
}

export function serviceDurationLabel(service: Service): string {
  return `${service.duration_minutes} 分鐘`;
}

export function clientQualifiesForMemberPrice(client: Client): boolean {
  return client.is_vip || client.balance > 0;
}

export interface ServicePriceDisplay {
  cashLabel: string;
  memberLabel: string | null;
  highlightMember: boolean;
  footnote: string | null;
}

export function servicePriceDisplay(
  service: Service,
  client: Client,
): ServicePriceDisplay {
  const memberLabel =
    service.price_member != null ? formatCurrency(service.price_member) : null;
  const highlightMember = clientQualifiesForMemberPrice(client) && memberLabel != null;

  let footnote: string | null = null;
  if (service.price_member == null) {
    footnote = '此時長僅提供單次付款';
  } else if (highlightMember) {
    footnote = '儲值會員可享會員價扣款';
  } else {
    footnote = '儲值後可享會員價';
  }

  return {
    cashLabel: formatCurrency(service.price_cash),
    memberLabel,
    highlightMember,
    footnote,
  };
}

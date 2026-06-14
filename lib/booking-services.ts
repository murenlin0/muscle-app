import type { Client, Service } from '@/lib/types/database';

/** 預約訊息與師傅端解析用的項目字串 */
export function bookingServiceLabel(durationMinutes: number): string {
  return `運動按摩 ${durationMinutes}min`;
}

export function serviceDurationLabel(service: Service): string {
  return `${service.duration_minutes} 分鐘`;
}

export function formatPriceNtd(amount: number): string {
  return `NT$ ${amount.toLocaleString('zh-TW')}`;
}

export function clientQualifiesForMemberPrice(client: Client): boolean {
  return client.is_vip || client.balance > 0;
}

export interface ServicePriceDisplay {
  cashLabel: string;
  memberLabel: string | null;
  highlightMember: boolean;
  estimatedAmount: number;
  estimatedLabel: string;
}

export function servicePriceDisplay(
  service: Service,
  client: Client,
): ServicePriceDisplay {
  const memberLabel =
    service.price_member != null ? formatPriceNtd(service.price_member) : null;
  const highlightMember = clientQualifiesForMemberPrice(client) && memberLabel != null;
  const estimatedAmount =
    highlightMember && service.price_member != null
      ? service.price_member
      : service.price_cash;

  return {
    cashLabel: formatPriceNtd(service.price_cash),
    memberLabel,
    highlightMember,
    estimatedAmount,
    estimatedLabel: formatPriceNtd(estimatedAmount),
  };
}

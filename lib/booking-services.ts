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

export interface ServiceBadge {
  label: string;
  tone: 'hot' | 'rec' | 'new';
}

export interface ServiceDisplayMeta {
  title: string;
  description: string;
  badge: ServiceBadge | null;
}

const SERVICE_META: Record<number, ServiceDisplayMeta> = {
  30: {
    title: '快速調理',
    description: '針對局部緊繃，適合時間有限或初次體驗的客人。',
    badge: null,
  },
  60: {
    title: '標準運動按摩',
    description: '舒緩深層肌肉與筋膜，改善運動後累積的痠痛與緊繃。',
    badge: { label: '熱門', tone: 'hot' },
  },
  90: {
    title: '深度恢復療程',
    description: '加強運動恢復與激痛點處理，適合訓練量較大或長期緊繃者。',
    badge: { label: '推薦', tone: 'rec' },
  },
  120: {
    title: '完整運動按摩',
    description: '全身性深度調理，平衡身心並改善活動度與循環。',
    badge: { label: '新', tone: 'new' },
  },
};

export function serviceDisplayMeta(service: Service): ServiceDisplayMeta {
  return (
    SERVICE_META[service.duration_minutes] ?? {
      title: service.name,
      description: '專業運動按摩，依您的需求由師傅調整手法。',
      badge: null,
    }
  );
}

export function serviceBadgeClass(tone: ServiceBadge['tone']): string {
  switch (tone) {
    case 'hot':
      return 'border-primary/50 bg-primary/15 text-primary';
    case 'rec':
      return 'border-emerald-400/45 bg-emerald-500/10 text-emerald-300';
    case 'new':
      return 'border-sky-400/45 bg-sky-500/10 text-sky-300';
  }
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

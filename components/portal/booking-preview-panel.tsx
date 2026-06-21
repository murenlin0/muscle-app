import type { LucideIcon } from 'lucide-react';
import { Calendar, Clock, MapPin, Phone, StickyNote, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface BookingPreviewData {
  storeLabel: string;
  staffName: string;
  clientName: string;
  phone: string;
  serviceLabel: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  calendarTitle: string;
  note: string | null;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function PreviewRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary/70" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium leading-snug">{children}</p>
      </div>
    </div>
  );
}

export function BookingPreviewPanel({
  preview,
  emptyHint,
  parsedBy,
}: {
  preview: BookingPreviewData | null;
  emptyHint?: string;
  parsedBy?: 'rules' | 'ai' | null;
}) {
  if (!preview) {
    return (
      <div className="glass-card flex h-full min-h-[280px] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Calendar className="size-7" strokeWidth={2} />
        </div>
        <p className="text-sm font-medium">尚無預覽</p>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {emptyHint ?? '貼上 LINE 預約確認訊息後，點「預覽解析」或「建立預約」'}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card flex h-full flex-col p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            解析結果
          </p>
          <h2 className="mt-1 text-lg font-bold">{preview.clientName}</h2>
          {parsedBy === 'ai' ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              由 AI 解析（Groq），請確認左側負責師傅（分店）與時間後再建立
            </p>
          ) : null}
        </div>
        <Badge className="shrink-0 bg-primary/15 text-primary hover:bg-primary/15">
          {preview.durationMinutes} 分
        </Badge>
      </div>

      <div className="space-y-4">
        <PreviewRow icon={MapPin} label="分店">
          {preview.storeLabel}
        </PreviewRow>
        <PreviewRow icon={User} label="負責師傅">
          {preview.staffName}
        </PreviewRow>
        <PreviewRow icon={Phone} label="電話">
          {preview.phone}
        </PreviewRow>
        <PreviewRow icon={Clock} label="時段">
          {formatTime(preview.startsAt)} — {formatTime(preview.endsAt)}
        </PreviewRow>
        <PreviewRow icon={Calendar} label="項目">
          {preview.serviceLabel}
        </PreviewRow>
        {preview.note ? (
          <PreviewRow icon={StickyNote} label="備註">
            {preview.note}
          </PreviewRow>
        ) : null}
      </div>

      <div className="mt-auto border-t border-primary/10 pt-4">
        <p className="text-xs text-muted-foreground">Google 日曆標題</p>
        <p className="mt-1 break-all font-mono text-xs text-accent">{preview.calendarTitle}</p>
      </div>
    </div>
  );
}

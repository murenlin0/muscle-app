import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatusBanner({
  variant,
  children,
}: {
  variant: 'success' | 'error';
  children: React.ReactNode;
}) {
  const Icon = variant === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        variant === 'success' && 'border-primary/30 bg-primary/10 text-primary',
        variant === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

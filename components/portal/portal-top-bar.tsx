import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PortalVariant = 'staff' | 'admin';

const VARIANT_LABEL: Record<PortalVariant, string> = {
  staff: '店內系統',
  admin: '管理後台',
};

export function PortalTopBar({
  variant,
  backHref,
  actions,
}: {
  variant: PortalVariant;
  backHref?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex items-center justify-between gap-4 border-b border-primary/15 pb-5">
      <div className="flex min-w-0 items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="返回"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'shrink-0')}
          >
            <ChevronLeft className="size-5" strokeWidth={2.25} />
          </Link>
        ) : null}
        <AppLogo size="sm" />
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 border-primary/35 text-xs font-medium',
            variant === 'staff' ? 'text-primary' : 'text-accent',
          )}
        >
          {VARIANT_LABEL[variant]}
        </Badge>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

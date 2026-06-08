import { PortalTopBar, type PortalVariant } from '@/components/portal/portal-top-bar';
import { cn } from '@/lib/utils';

export function PortalShell({
  title,
  subtitle,
  variant = 'staff',
  backHref,
  headerActions,
  size = 'md',
  children,
}: {
  title: string;
  subtitle?: string;
  variant?: PortalVariant;
  backHref?: string;
  headerActions?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}) {
  const maxWidth =
    size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-3xl' : 'max-w-md';

  return (
    <main className="min-h-svh bg-background">
      <div className={cn('mx-auto px-5 py-6 sm:py-8', maxWidth)}>
        <PortalTopBar variant={variant} backHref={backHref} actions={headerActions} />
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  );
}

import { Loader2 } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';

export function LoadingScreen({ message = '載入中…' }: { message?: string }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6">
      <AppLogo size="md" priority />
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2
          className="size-9 animate-spin text-primary drop-shadow-[0_0_12px_oklch(0.55_0.12_285/0.45)]"
          aria-hidden
        />
        <p className="text-base font-medium">{message}</p>
      </div>
    </main>
  );
}

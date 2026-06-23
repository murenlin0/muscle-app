import { Loader2 } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';

export function LoadingScreen({ message = '載入中…' }: { message?: string }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-6">
      <AppLogo size="lg" priority />
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <Loader2
          className="size-11 animate-spin text-primary drop-shadow-[0_0_14px_oklch(0.55_0.12_285/0.45)]"
          aria-hidden
        />
        <p className="text-lg font-medium">{message}</p>
      </div>
    </main>
  );
}

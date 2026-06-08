import { HeroSection } from '@/components/marketing/hero-section';
import { StoreShowcase } from '@/components/marketing/store-showcase';

export default function HomePage() {
  return (
    <main className="min-h-svh">
      <HeroSection />
      <StoreShowcase />
      <footer className="border-t border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} 筋棧 · muscle.com.tw
      </footer>
    </main>
  );
}

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '店長後台 · 筋棧',
};

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '總管理後台 · 筋棧',
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}

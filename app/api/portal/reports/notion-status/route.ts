import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/portal-api';
import { probeNotionConnection } from '@/lib/notion-api';

export async function GET() {
  const session = await requireSuperAdmin();
  if (session instanceof NextResponse) return session;

  const result = await probeNotionConnection();
  return NextResponse.json({
    ...result,
    vercelEnv: process.env.VERCEL_ENV ?? 'local',
  });
}

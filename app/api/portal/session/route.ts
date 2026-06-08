import { NextResponse } from 'next/server';
import { getPortalSession, portalHomePath } from '@/lib/portal-session';

export async function GET() {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ session: null });
  }
  return NextResponse.json({
    session,
    home: portalHomePath(session),
  });
}

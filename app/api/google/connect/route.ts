import { NextResponse } from 'next/server';
import { getPortalSession, canViewReports } from '@/lib/portal-session';
import { buildGoogleAuthUrl, getGoogleOAuthConfig } from '@/lib/google-oauth';

/** 已登入後台時一鍵開始 Google 授權（不用手打 key） */
export async function GET(request: Request) {
  const session = await getPortalSession();
  if (!session || !canViewReports(session)) {
    return NextResponse.redirect(new URL('/login?next=/admin/google', request.url));
  }

  const config = getGoogleOAuthConfig(request);
  if (!config) {
    return NextResponse.redirect(new URL('/admin/google?error=missing_client', request.url));
  }

  return NextResponse.redirect(buildGoogleAuthUrl(config));
}

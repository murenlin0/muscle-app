import { NextResponse } from 'next/server';
import { canViewReports, getPortalSession } from '@/lib/portal-session';

/** 一鍵開始 OAuth（本機免 key；正式站需登入後台） */
export async function GET(request: Request) {
  const key = process.env.GOOGLE_OAUTH_SETUP_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: '缺少 GOOGLE_OAUTH_SETUP_KEY' }, { status: 500 });
  }

  if (process.env.NODE_ENV === 'production') {
    const session = await getPortalSession();
    if (!session || !canViewReports(session)) {
      return NextResponse.redirect(new URL('/login?next=/admin/google', request.url));
    }
  }

  const authUrl = new URL('/api/google/auth', request.url);
  authUrl.searchParams.set('key', key);
  return NextResponse.redirect(authUrl);
}

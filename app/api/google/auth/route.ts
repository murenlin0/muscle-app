import { NextResponse } from 'next/server';
import { canViewReports, getPortalSession } from '@/lib/portal-session';
import {
  assertGoogleSetupKey,
  buildGoogleAuthUrl,
  getGoogleOAuthConfig,
} from '@/lib/google-oauth';

async function canStartGoogleAuth(request: Request): Promise<boolean> {
  const session = await getPortalSession();
  if (session && canViewReports(session)) return true;
  return assertGoogleSetupKey(request) === null;
}

export async function GET(request: Request) {
  if (!(await canStartGoogleAuth(request))) {
    return NextResponse.json(
      {
        error:
          '請先登入後台，或在網址加上 ?key=你的 GOOGLE_OAUTH_SETUP_KEY（見 .env.local）',
      },
      { status: 403 },
    );
  }

  const config = getGoogleOAuthConfig(request);
  if (!config) {
    return NextResponse.json(
      {
        error:
          '缺少 GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET。請先寫入 .env.local 並重啟 dev。',
      },
      { status: 500 },
    );
  }

  return NextResponse.redirect(buildGoogleAuthUrl(config));
}

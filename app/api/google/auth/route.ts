import { NextResponse } from 'next/server';
import {
  assertGoogleSetupKey,
  buildGoogleAuthUrl,
  getGoogleOAuthConfig,
} from '@/lib/google-oauth';

export async function GET(request: Request) {
  const keyError = assertGoogleSetupKey(request);
  if (keyError) {
    return NextResponse.json({ error: keyError }, { status: 403 });
  }

  const config = getGoogleOAuthConfig(request);
  if (!config) {
    return NextResponse.json(
      {
        error:
          '缺少 GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET。請先寫入 .env.local 並重啟 npm run dev。',
      },
      { status: 500 },
    );
  }

  return NextResponse.redirect(buildGoogleAuthUrl(config));
}

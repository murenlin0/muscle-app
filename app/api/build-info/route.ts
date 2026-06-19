import { NextResponse } from 'next/server';
import { isGroqConfigured, probeGroqKey } from '@/lib/booking-message-ai';

/** 公開：確認正式站是否已部署含 Groq AI 的版本 */
export async function GET() {
  const groqConfigured = isGroqConfigured();
  const groqOk = groqConfigured ? await probeGroqKey() : false;

  return NextResponse.json({
    staffAi: 'groq-v1',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    env: process.env.VERCEL_ENV ?? 'local',
    groqConfigured,
    groqOk,
  });
}

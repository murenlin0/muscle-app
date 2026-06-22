import { NextResponse } from 'next/server';
import { isGeminiConfigured, probeGeminiKey } from '@/lib/booking-message-ai';

/** 公開：確認正式站 AI 設定 */
export async function GET() {
  const geminiConfigured = isGeminiConfigured();
  const geminiOk = geminiConfigured ? await probeGeminiKey() : false;

  return NextResponse.json({
    staffAi: 'gemini-v1',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    env: process.env.VERCEL_ENV ?? 'local',
    geminiConfigured,
    geminiOk,
  });
}

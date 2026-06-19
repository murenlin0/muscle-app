import { NextResponse } from 'next/server';

/** 公開：確認正式站是否已部署含 Groq AI 的版本 */
export async function GET() {
  return NextResponse.json({
    staffAi: 'groq-v1',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    env: process.env.VERCEL_ENV ?? 'local',
  });
}

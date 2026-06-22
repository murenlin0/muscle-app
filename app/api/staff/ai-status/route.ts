import { NextResponse } from 'next/server';
import { isGeminiConfigured, probeGeminiKey } from '@/lib/booking-message-ai';
import { requireStaffSession } from '@/lib/portal-api';

/** 師傅登入後可確認正式站 AI 設定（不暴露金鑰） */
export async function GET() {
  const session = await requireStaffSession();
  if (session instanceof NextResponse) return session;

  const gemini = isGeminiConfigured();
  const geminiOk = gemini ? await probeGeminiKey() : false;

  return NextResponse.json({
    ok: geminiOk,
    provider: gemini ? 'gemini' : 'none',
    gemini,
    geminiOk,
  });
}

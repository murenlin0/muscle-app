import { NextResponse } from 'next/server';
import { isGeminiConfigured, isGroqConfigured } from '@/lib/booking-message-ai';
import { requireStaffSession } from '@/lib/portal-api';

/** 師傅登入後可確認正式站 AI 設定（不暴露金鑰） */
export async function GET() {
  const session = await requireStaffSession();
  if (session instanceof NextResponse) return session;

  const groq = isGroqConfigured();
  const gemini = isGeminiConfigured();

  return NextResponse.json({
    ok: groq || gemini,
    provider: groq ? 'groq' : gemini ? 'gemini' : 'none',
    groq,
    gemini,
  });
}

import { NextResponse } from 'next/server';
import { loginAdmin, loginStaff } from '@/lib/portal-auth-server';
import {
  createPortalSessionToken,
  portalHomePath,
  setPortalSessionCookie,
} from '@/lib/portal-session';

type LoginBody =
  | { mode: 'staff'; staffId?: string; pin?: string }
  | { mode: 'admin'; password?: string };

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    let session;
    if (body.mode === 'staff') {
      if (!body.staffId || !body.pin) {
        return NextResponse.json({ error: '請選擇師傅並輸入 PIN' }, { status: 400 });
      }
      session = await loginStaff(body.staffId, body.pin);
    } else if (body.mode === 'admin') {
      if (!body.password) {
        return NextResponse.json({ error: '請輸入管理密碼' }, { status: 400 });
      }
      session = await loginAdmin(body.password);
    } else {
      return NextResponse.json({ error: '無效的登入模式' }, { status: 400 });
    }

    const token = createPortalSessionToken(session);
    await setPortalSessionCookie(token);

    return NextResponse.json({
      ok: true,
      session,
      redirect: portalHomePath(session),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '登入失敗';
    const status = message.includes('錯誤') || message.includes('不存在') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

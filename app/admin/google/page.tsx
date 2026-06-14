import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalSession, canViewReports } from '@/lib/portal-session';
import { isGoogleCalendarConfigured } from '@/lib/google-oauth';

export default async function GoogleSetupAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getPortalSession();
  if (!session || !canViewReports(session)) {
    redirect('/login?next=/admin/google');
  }

  const params = await searchParams;
  const configured = isGoogleCalendarConfigured();
  const setupKey = process.env.GOOGLE_OAUTH_SETUP_KEY?.trim();
  const localAuthUrl = setupKey
    ? `http://localhost:3000/api/google/auth?key=${encodeURIComponent(setupKey)}`
    : null;

  return (
    <main className="mx-auto max-w-lg px-5 py-10 text-[#ddd]">
      <h1 className="mb-2 text-xl font-semibold">Google 日曆串接</h1>
      <p className="mb-6 text-sm text-[#888]">
        連線 muscle.com.tw@gmail.com 日曆，供之後自動建預約與 Sync。
      </p>

      {params.error === 'missing_client' ? (
        <p className="mb-4 rounded border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          缺少 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET，請檢查 .env.local 並重啟 dev。
        </p>
      ) : null}

      <div className="mb-6 rounded-lg border border-[#333] bg-[#1a1a1a] p-4">
        <p className="text-sm">
          狀態：
          <span className={configured ? 'text-emerald-400' : 'text-amber-400'}>
            {configured ? '已設定 refresh token' : '尚未完成 OAuth 授權'}
          </span>
        </p>
        {!configured ? (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[#aaa]">
            <li>確認 .env.local 已有 Client ID / Secret</li>
            <li>下方按鈕用 muscle.com.tw@gmail.com 登入並按允許</li>
            <li>複製 callback 頁的 GOOGLE_REFRESH_TOKEN 到 .env.local</li>
            <li>重啟 dev（或執行 dev.bat）</li>
          </ol>
        ) : (
          <p className="mt-2 text-sm text-[#888]">
            已可呼叫 Calendar API。Staff 自動建事件與 Sync 仍待下一階段開發。
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/api/google/connect"
          className="inline-flex h-11 items-center justify-center rounded-md bg-[#2a2a2a] text-sm font-medium text-white hover:bg-[#333]"
        >
          {configured ? '重新授權 Google 日曆' : '開始 Google 授權'}
        </Link>
        <Link href="/admin/reports" className="text-center text-sm text-[#888] hover:text-[#ccc]">
          返回報表
        </Link>
      </div>

      {localAuthUrl && !configured ? (
        <p className="mt-6 break-all text-xs text-[#555]">
          本機備用連結（需 dev 在跑）：
          <br />
          <code>{localAuthUrl}</code>
        </p>
      ) : null}
    </main>
  );
}

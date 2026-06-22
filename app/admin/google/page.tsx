import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalSession, canViewReports } from '@/lib/portal-session';
import { isGoogleCalendarReady } from '@/lib/integration-settings';
import { isValidGoogleSetupKey, refreshGoogleAccessToken } from '@/lib/google-oauth';

export default async function GoogleSetupAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; key?: string }>;
}) {
  const params = await searchParams;
  const keyAuthorized = isValidGoogleSetupKey(params.key);

  const session = await getPortalSession();
  if (!keyAuthorized && (!session || !canViewReports(session))) {
    redirect('/login?next=/admin/google');
  }

  const configured = await isGoogleCalendarReady();
  let tokenError: string | null = null;
  if (configured) {
    try {
      await refreshGoogleAccessToken();
    } catch (e) {
      tokenError = e instanceof Error ? e.message : '連線測試失敗';
    }
  }
  const setupKey = process.env.GOOGLE_OAUTH_SETUP_KEY?.trim();
  const authHref = keyAuthorized
    ? '/api/google/setup'
    : configured
      ? '/api/google/connect'
      : '/api/google/setup';
  const pageWithKey =
    keyAuthorized && params.key
      ? `/admin/google?key=${encodeURIComponent(params.key)}`
      : '/admin/google';

  return (
    <main className="mx-auto max-w-lg px-5 py-10 text-[#ddd]">
      <h1 className="mb-2 text-xl font-semibold">Google 日曆串接</h1>
      <p className="mb-6 text-sm text-[#888]">
        連線 muscle.com.tw@gmail.com 日曆，供之後自動建預約與 Sync。
      </p>

      {keyAuthorized ? (
        <p className="mb-4 rounded border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200/90">
          已用 setup key 進入（本機設定用，無需後台登入）。
        </p>
      ) : null}

      {params.error === 'missing_client' ? (
        <p className="mb-4 rounded border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          缺少 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET，請檢查 .env.local 並重啟 dev。
        </p>
      ) : null}

      <div className="mb-6 rounded-lg border border-[#333] bg-[#1a1a1a] p-4">
        <p className="text-sm">
          狀態：
          <span
            className={
              configured && !tokenError ? 'text-emerald-400' : 'text-amber-400'
            }
          >
            {!configured
              ? '尚未完成 OAuth 授權'
              : tokenError
                ? '授權已失效，需重新授權'
                : '已連線，token 有效'}
          </span>
        </p>
        {tokenError ? (
          <p className="mt-2 text-sm text-rose-300/90">
            {tokenError.includes('expired') || tokenError.includes('revoked')
              ? 'Google refresh token 已過期或被撤銷，請用 muscle.com.tw@gmail.com 按下方「重新授權」。'
              : tokenError}
          </p>
        ) : null}
        {!configured ? (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[#aaa]">
            <li>確認 dev 有在跑（dev.bat 或 npm run dev）</li>
            <li>確認 .env.local 已有 Client ID / Secret</li>
            <li>下方按鈕用 muscle.com.tw@gmail.com 登入並按允許</li>
            <li>複製 callback 頁的 GOOGLE_REFRESH_TOKEN 到 .env.local 並重啟 dev</li>
          </ol>
        ) : (
          <p className="mt-2 text-sm text-[#888]">
            {tokenError
              ? '重新授權後無需改 Vercel 環境變數（token 存於資料庫）。'
              : 'Staff 建立預約會自動寫入 Google 日曆灰色待結帳事件。'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href={authHref}
          className="inline-flex h-11 items-center justify-center rounded-md bg-[#2a2a2a] text-sm font-medium text-white hover:bg-[#333]"
        >
          {configured ? '重新授權 Google 日曆' : '開始 Google 授權'}
        </Link>
        {!keyAuthorized ? (
          <Link href="/admin/reports" className="text-center text-sm text-[#888] hover:text-[#ccc]">
            返回報表
          </Link>
        ) : null}
      </div>

      {setupKey && !configured && !keyAuthorized ? (
        <p className="mt-6 text-xs text-[#666]">
          本機免登入：在網址後加{' '}
          <code className="text-[#888]">?key=你的GOOGLE_OAUTH_SETUP_KEY</code>
        </p>
      ) : null}

      {keyAuthorized ? (
        <p className="mt-4 break-all text-xs text-[#555]">
          書籤此頁：
          <br />
          <code>http://localhost:3000{pageWithKey}</code>
        </p>
      ) : null}
    </main>
  );
}

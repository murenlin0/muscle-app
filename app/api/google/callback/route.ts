import { NextResponse } from 'next/server';
import {
  escapeHtml,
  exchangeCodeForTokens,
  getGoogleOAuthConfig,
  listGoogleCalendars,
} from '@/lib/google-oauth';
import { saveGoogleOAuthTokens } from '@/lib/integration-settings';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return htmlPage('授權失敗', `<p>Google 回傳：${escapeHtml(oauthError)}</p>`, 400);
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return htmlPage('缺少授權碼', '<p>請從 /api/google/auth 重新開始。</p>', 400);
  }

  const config = getGoogleOAuthConfig(request);
  if (!config) {
    return htmlPage(
      '設定不完整',
      '<p>缺少 GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET。</p>',
      500,
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, config);
    const calendars = await listGoogleCalendars(tokens.access_token);
    const primary = calendars.find((c) => c.primary) ?? calendars[0];

    const suggestedCalendarId = primary?.id ?? 'muscle.com.tw@gmail.com';

    let savedNote =
      '<p class="warn">未取得 refresh token。請到 Google 帳號移除第三方存取後再試。</p>';
    if (tokens.refresh_token) {
      await saveGoogleOAuthTokens({
        refreshToken: tokens.refresh_token,
        calendarId: suggestedCalendarId,
      });
      savedNote =
        '<p class="ok"><strong>已完成串接</strong>：token 已寫入 .env.local（及資料庫若可用）。請重啟 dev。</p>';
      try {
        const { ensureCalendarWatch } = await import('@/lib/google-calendar-watch');
        const watch = await ensureCalendarWatch();
        savedNote += `<p class="ok">日曆即時同步已啟用（webhook 效期至 ${new Date(watch.expiration).toLocaleString('zh-TW')}）。</p>`;
      } catch (watchErr) {
        savedNote += `<p class="warn">即時 webhook 註冊失敗：${escapeHtml(watchErr instanceof Error ? watchErr.message : '未知錯誤')}（仍可用 Cron 每 5 分鐘同步）</p>`;
      }
    }

    const calendarRows = calendars
      .slice(0, 12)
      .map(
        (c) =>
          `<tr><td>${escapeHtml(c.summary)}</td><td><code>${escapeHtml(c.id)}</code></td><td>${c.primary ? '主日曆' : ''}</td></tr>`,
      )
      .join('');

    const body = `
      <p class="ok">授權成功。</p>
      ${savedNote}
      <label class="label">GOOGLE_CALENDAR_ID</label>
      <textarea readonly rows="2">${escapeHtml(suggestedCalendarId)}</textarea>
      <h2>可寫入的日曆</h2>
      <table>
        <thead><tr><th>名稱</th><th>Calendar ID</th><th></th></tr></thead>
        <tbody>${calendarRows}</tbody>
      </table>
      <p class="muted">redirect_uri：<code>${escapeHtml(config.redirectUri)}</code></p>
      <p><a href="/admin/google">返回設定頁</a></p>
    `;

    return htmlPage('Google 日曆已連線', body);
  } catch (e) {
    const message = e instanceof Error ? e.message : '未知錯誤';
    return htmlPage(
      '換取 token 失敗',
      `<p>${escapeHtml(message)}</p><p class="muted">請確認 OAuth Client 的重新導向 URI 與上方 redirect_uri 完全一致。</p>`,
      500,
    );
  }
}

function htmlPage(title: string, body: string, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · 筋棧</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #1a1a1a; }
    h1 { font-size: 1.35rem; }
    h2 { font-size: 1rem; margin-top: 1.5rem; }
    .ok { color: #166534; }
    .warn { color: #b45309; }
    .muted { color: #666; font-size: 0.9rem; }
    .label { display: block; font-weight: 600; margin: 1rem 0 0.35rem; }
    textarea { width: 100%; font-family: ui-monospace, monospace; font-size: 0.8rem; padding: 0.5rem; }
    code { background: #f3f3f3; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { border-bottom: 1px solid #eee; padding: 0.4rem 0.25rem; text-align: left; vertical-align: top; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

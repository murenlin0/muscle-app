import { NextResponse } from 'next/server';
import {
  escapeHtml,
  exchangeCodeForTokens,
  getGoogleOAuthConfig,
  listGoogleCalendars,
} from '@/lib/google-oauth';

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

    const refreshBlock = tokens.refresh_token
      ? `<label class="label">GOOGLE_REFRESH_TOKEN（貼到 .env.local 與 Vercel，勿公開）</label>
         <textarea readonly rows="4">${escapeHtml(tokens.refresh_token)}</textarea>`
      : `<p class="warn">這次沒有拿到 refresh token。請到 Google 帳號 → 安全性 → 第三方存取，移除「筋棧」後，再用 /api/google/auth 重試（需 prompt=consent）。</p>`;

    const calendarRows = calendars
      .slice(0, 12)
      .map(
        (c) =>
          `<tr><td>${escapeHtml(c.summary)}</td><td><code>${escapeHtml(c.id)}</code></td><td>${c.primary ? '主日曆' : ''}</td></tr>`,
      )
      .join('');

    const suggestedCalendarId = primary?.id ?? 'muscle.com.tw@gmail.com';

    const body = `
      <p class="ok">授權成功。程式已能讀取你的日曆列表。</p>
      ${refreshBlock}
      <label class="label">建議 GOOGLE_CALENDAR_ID</label>
      <textarea readonly rows="2">${escapeHtml(suggestedCalendarId)}</textarea>
      <h2>可寫入的日曆</h2>
      <table>
        <thead><tr><th>名稱</th><th>Calendar ID</th><th></th></tr></thead>
        <tbody>${calendarRows}</tbody>
      </table>
      <h2>下一步</h2>
      <ol>
        <li>把 <code>GOOGLE_REFRESH_TOKEN</code> 和 <code>GOOGLE_CALENDAR_ID</code> 加入 <code>.env.local</code></li>
        <li>Vercel 專案 Settings → Environment Variables 也加同樣四個變數</li>
        <li>重啟 dev / 重新部署</li>
      </ol>
      <p class="muted">redirect_uri 本次使用：<code>${escapeHtml(config.redirectUri)}</code></p>
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

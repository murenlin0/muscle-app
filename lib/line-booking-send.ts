import liff from '@line/liff';

export type BookingSendResult =
  | { mode: 'sent' }
  | { mode: 'chat_opened' }
  | { mode: 'copied' };

/** 從官方帳號加好友／聊天連結取出 @BasicId */
export function parseLineOaBasicId(lineOfficialUrl: string): string | null {
  const m = lineOfficialUrl.match(/@([a-zA-Z0-9_]+)/);
  return m ? `@${m[1]}` : null;
}

function buildOaPrefillUrl(basicId: string, messageText: string): string {
  return `https://line.me/R/oaMessage/${basicId}/?${encodeURIComponent(messageText)}`;
}

async function ensureChatMessagePermission(): Promise<void> {
  if (!liff.permission?.query) return;
  try {
    const status = await liff.permission.query('chat_message.write');
    if (status.state === 'prompt') {
      await liff.permission.requestAll();
    }
  } catch {
    // 舊版 LIFF 或無 permission API 時略過
  }
}

/**
 * 嘗試把預約文字送到官方 LINE：
 * 1. liff.sendMessages（完全自動，需 chat_message.write + 從官方帳號對話／聊天室開啟）
 * 2. 開啟官方帳號對話並預填文字（客人按一下傳送）
 * 3. 複製到剪貼簿
 */
export async function sendBookingToOfficialLine(
  messageText: string,
  lineOfficialUrl: string,
): Promise<BookingSendResult> {
  if (!liff.isInClient()) {
    await navigator.clipboard.writeText(messageText);
    return { mode: 'copied' };
  }

  await ensureChatMessagePermission();

  try {
    await liff.sendMessages([{ type: 'text', text: messageText }]);
    return { mode: 'sent' };
  } catch {
    // Rich Menu 開啟時常無法 sendMessages，改開官方帳號對話預填
  }

  const basicId = parseLineOaBasicId(lineOfficialUrl);
  if (basicId && !basicId.includes('REPLACE')) {
    const oaUrl = buildOaPrefillUrl(basicId, messageText);
    try {
      liff.openWindow({ url: oaUrl, external: false });
      return { mode: 'chat_opened' };
    } catch {
      // openWindow 失敗時改複製
    }
  }

  await navigator.clipboard.writeText(messageText);
  return { mode: 'copied' };
}

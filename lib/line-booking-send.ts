import liff from '@line/liff';
import type { StoreSlug } from '@/lib/stores';
import { getLineOaBasicIdForStore } from '@/lib/store-liff';

export type BookingSendResult =
  | { mode: 'sent' }
  | { mode: 'chat_opened' }
  | { mode: 'copied' };

/** 從官方帳號加好友／聊天連結取出 @BasicId */
export function parseLineOaBasicId(lineOfficialUrl: string): string | null {
  const m = lineOfficialUrl.match(/@([a-zA-Z0-9_]+)/);
  if (!m) return null;
  const id = `@${m[1]}`;
  if (id.includes('REPLACE')) return null;
  return id;
}

export function resolveLineOaBasicId(
  storeSlug: StoreSlug,
  lineOfficialUrl: string,
): string | null {
  return getLineOaBasicIdForStore(storeSlug) ?? parseLineOaBasicId(lineOfficialUrl);
}

function buildOaPrefillUrl(basicId: string, messageText: string): string {
  return `https://line.me/R/oaMessage/${basicId}/?${encodeURIComponent(messageText)}`;
}

export function buildOfficialLinePrefillUrl(
  storeSlug: StoreSlug,
  lineOfficialUrl: string,
  messageText: string,
): string | null {
  const basicId = resolveLineOaBasicId(storeSlug, lineOfficialUrl);
  if (!basicId) return null;
  return buildOaPrefillUrl(basicId, messageText);
}

async function ensureChatMessagePermission(): Promise<void> {
  if (!liff.permission?.query) return;
  try {
    const status = await liff.permission.query('chat_message.write');
    if (status.state === 'prompt' || status.state === 'unavailable') {
      await liff.permission.requestAll();
    }
  } catch {
    // 舊版 LIFF 或無 permission API 時略過
  }
}

export function openOfficialLinePrefill(
  storeSlug: StoreSlug,
  lineOfficialUrl: string,
  messageText: string,
): boolean {
  const url = buildOfficialLinePrefillUrl(storeSlug, lineOfficialUrl, messageText);
  if (!url) return false;
  try {
    liff.openWindow({ url, external: false });
    return true;
  } catch {
    try {
      liff.openWindow({ url, external: true });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 嘗試把預約文字送到官方 LINE：
 * 1. liff.sendMessages（完全自動，需 chat_message.write + 從官方對話／聊天室開啟）
 * 2. 開啟官方帳號對話並預填文字（客人按一下「傳送」）
 * 3. 複製到剪貼簿（最後手段）
 */
export async function sendBookingToOfficialLine(
  messageText: string,
  lineOfficialUrl: string,
  storeSlug: StoreSlug,
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

  if (openOfficialLinePrefill(storeSlug, lineOfficialUrl, messageText)) {
    return { mode: 'chat_opened' };
  }

  await navigator.clipboard.writeText(messageText);
  return { mode: 'copied' };
}

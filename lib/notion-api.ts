const NOTION_VERSION = '2022-06-28';

export const NOTION_STORE1_DAILY_DB_ID = 'bba35d9c-9bb4-4299-80e8-c91fbd23f5ce';

export interface NotionDailyRow {
  pageId: string;
  title: string;
  dateStart: string | null;
  amount: number;
  serviceType: string | null;
  paymentMethods: string[];
  staffName: string | null;
  isDesignated: boolean;
  memberNote: string | null;
  lastEdited: string | null;
}

const NOTION_KEY_ENV_NAMES = [
  'NOTION_API_KEY',
  'NOTION_TOKEN',
  'NOTION_INTEGRATION_SECRET',
] as const;

export function sanitizeNotionToken(raw: string): string {
  return raw
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, '');
}

export function readNotionTokenFromEnv(): string | null {
  for (const name of NOTION_KEY_ENV_NAMES) {
    const value = process.env[name];
    if (!value?.trim()) continue;
    return sanitizeNotionToken(value);
  }
  return null;
}

export interface NotionKeyDiagnostics {
  configured: boolean;
  envVarUsed: string | null;
  keyPrefix: string | null;
  keyLength: number;
  formatOk: boolean;
  formatHint: string | null;
}

export function getNotionKeyDiagnostics(): NotionKeyDiagnostics {
  let envVarUsed: string | null = null;
  let token: string | null = null;

  for (const name of NOTION_KEY_ENV_NAMES) {
    const value = process.env[name];
    if (!value?.trim()) continue;
    envVarUsed = name;
    token = sanitizeNotionToken(value);
    break;
  }

  if (!token) {
    return {
      configured: false,
      envVarUsed: null,
      keyPrefix: null,
      keyLength: 0,
      formatOk: false,
      formatHint: `未設定環境變數。請在 Vercel 新增 NOTION_API_KEY（Internal Integration Secret）。`,
    };
  }

  const formatOk = token.startsWith('secret_') || token.startsWith('ntn_');
  let formatHint: string | null = null;
  if (!formatOk) {
    if (token.startsWith('oauth_') || token.includes('client')) {
      formatHint = '這看起來像 OAuth 金鑰。請改用 Internal Integration 的 Secret（secret_ 或 ntn_ 開頭）。';
    } else if (token.length < 40) {
      formatHint = '金鑰太短，可能只貼到一部分。請重新複製完整的 Internal Integration Secret。';
    } else {
      formatHint = '金鑰格式異常。請到 notion.so/my-integrations 建立「內部整合」，複製 Secret。';
    }
  }

  return {
    configured: true,
    envVarUsed,
    keyPrefix: token.slice(0, Math.min(12, token.length)),
    keyLength: token.length,
    formatOk,
    formatHint,
  };
}

function notionToken(): string {
  const raw = readNotionTokenFromEnv();
  if (!raw) {
    throw new Error(
      '缺少 NOTION_API_KEY。請在 Vercel → Environment Variables 設定 Internal Integration 的 secret_... 金鑰，並 Redeploy。',
    );
  }
  const diag = getNotionKeyDiagnostics();
  if (!diag.formatOk) {
    throw new Error(diag.formatHint ?? 'NOTION_API_KEY 格式不正確。');
  }
  return raw;
}

export interface NotionProbeResult {
  ok: boolean;
  diagnostics: NotionKeyDiagnostics;
  databaseId: string;
  databaseTitle?: string;
  notionStatus?: number;
  notionCode?: string;
  notionMessage?: string;
  hint?: string;
}

export async function probeNotionConnection(
  databaseId = NOTION_STORE1_DAILY_DB_ID,
): Promise<NotionProbeResult> {
  const diagnostics = getNotionKeyDiagnostics();
  const base = {
    diagnostics,
    databaseId,
  };

  if (!diagnostics.configured) {
    return {
      ...base,
      ok: false,
      hint: 'Vercel 尚未設定 NOTION_API_KEY，或設定後尚未 Redeploy。',
    };
  }

  if (!diagnostics.formatOk) {
    return {
      ...base,
      ok: false,
      hint: diagnostics.formatHint ?? '金鑰格式不正確。',
    };
  }

  const token = notionToken();

  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    },
  });

  if (res.ok) {
    const data = (await res.json()) as {
      title?: { plain_text: string }[];
    };
    const databaseTitle = (data.title ?? []).map((t) => t.plain_text).join('');
    return {
      ...base,
      ok: true,
      databaseTitle: databaseTitle || undefined,
    };
  }

  let notionCode: string | undefined;
  let notionMessage: string | undefined;
  try {
    const err = (await res.json()) as { code?: string; message?: string };
    notionCode = err.code;
    notionMessage = err.message;
  } catch {
    notionMessage = await res.text();
  }

  let hint = '請檢查 Notion 設定。';
  if (res.status === 401) {
    hint =
      '金鑰被 Notion 拒絕。請到 notion.so/my-integrations → 你的整合 → 重新複製 Internal Integration Secret，覆蓋 Vercel 的 NOTION_API_KEY，然後 Redeploy。若曾按「重新產生」，舊金鑰會立即失效。';
  } else if (res.status === 404) {
    hint =
      '金鑰有效但找不到資料庫。請在 Notion「新版筋棧1店每日紀錄」→ ⋯ → Connect to → 選同一個 Integration。';
  }

  return {
    ...base,
    ok: false,
    notionStatus: res.status,
    notionCode,
    notionMessage,
    hint,
  };
}

function wrapNotionError(status: number, body: string): Error {
  if (status === 401) {
    return new Error(
      'Notion API 金鑰無效 (401)。請到 notion.so/my-integrations 複製 Internal Integration Secret，貼到 Vercel 的 NOTION_API_KEY，確認資料庫已 Connect to 該 Integration，然後 Redeploy。',
    );
  }
  if (status === 404) {
    return new Error(
      '找不到 Notion 資料庫 (404)。請在「新版筋棧1店每日紀錄」右上角 ⋯ → Connect to → 選你的 Integration。',
    );
  }
  return new Error(`Notion query 失敗 (${status}): ${body}`);
}

function textFromRich(prop: { title?: { plain_text: string }[] } | undefined): string {
  return (prop?.title ?? []).map((t) => t.plain_text).join('').trim();
}

function textFromRichText(prop: { rich_text?: { plain_text: string }[] } | undefined): string {
  return (prop?.rich_text ?? []).map((t) => t.plain_text).join('').trim();
}

function selectName(prop: { select?: { name: string } | null } | undefined): string | null {
  return prop?.select?.name ?? null;
}

function multiSelectNames(prop: { multi_select?: { name: string }[] } | undefined): string[] {
  return (prop?.multi_select ?? []).map((o) => o.name);
}

function numberValue(prop: { number?: number | null } | undefined): number {
  const n = prop?.number;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function dateStart(prop: { date?: { start: string } | null } | undefined): string | null {
  return prop?.date?.start ?? null;
}

function checkboxValue(prop: { checkbox?: boolean } | undefined): boolean {
  return Boolean(prop?.checkbox);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNotionPage(page: any): NotionDailyRow {
  const props = page.properties ?? {};
  const title =
    textFromRich(props['名稱電話']) ||
    textFromRich(props['Name']) ||
    page.id;

  return {
    pageId: page.id,
    title,
    dateStart: dateStart(props['Date']),
    amount: numberValue(props['金額數字']),
    serviceType: selectName(props['消費類型']),
    paymentMethods: multiSelectNames(props['付款方式']),
    staffName: selectName(props['師傅']),
    isDesignated: checkboxValue(props['指定']),
    memberNote: textFromRichText(props['會員備註']) || null,
    lastEdited: page.last_edited_time ?? null,
  };
}

export async function queryNotionDatabaseAll(
  databaseId: string,
  pageSize = 100,
): Promise<NotionDailyRow[]> {
  const rows: NotionDailyRow[] = [];
  let cursor: string | undefined;

  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken()}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        page_size: pageSize,
        start_cursor: cursor,
        sorts: [{ property: 'Date', direction: 'descending' }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw wrapNotionError(res.status, body);
    }

    const data = (await res.json()) as {
      results: unknown[];
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const page of data.results) {
      rows.push(mapNotionPage(page));
    }

    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return rows;
}

export async function updateNotionPageProperties(
  pageId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw wrapNotionError(res.status, body);
  }
}

export function buildNotionTitleUpdate(title: string) {
  return {
    名稱電話: {
      title: [{ type: 'text', text: { content: title } }],
    },
  };
}

export function buildNotionStaffUpdate(staffName: string) {
  return {
    師傅: {
      select: { name: staffName },
    },
  };
}

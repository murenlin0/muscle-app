import type { StoreSlug } from '@/lib/stores';
import {
  computeServiceHours,
  serviceHoursEqual,
} from '@/lib/service-hours';
import {
  getNotionProperty,
  getNotionPropertyName,
  resolveCanonicalPaymentMethods,
} from '@/lib/notion-store-schema';

export {
  NOTION_CANONICAL_FIELDS,
  NOTION_SCHEMA_BY_STORE,
  STORE2_PAYMENT_LOCATION_MAP,
  getNotionFieldSchema,
  getNotionProperty,
  getNotionPropertyName,
  mapStore2PaymentLocation,
  resolveCanonicalPaymentMethods,
} from '@/lib/notion-store-schema';
export type { NotionCanonicalField, NotionFieldSchema } from '@/lib/notion-store-schema';

const NOTION_VERSION = '2022-06-28';
const NOTION_VERSION_MULTI_SOURCE = '2025-09-03';

export const NOTION_STORE1_DAILY_DB_ID = 'bba35d9c-9bb4-4299-80e8-c91fbd23f5ce';
/** 民有店「新版筋棧1店每日紀錄」data source（實際流水資料） */
export const NOTION_STORE1_DAILY_DATA_SOURCE_ID = '13807d21-c964-8145-acb2-000b99a3f61a';
/** 文一店資料庫容器（含多個 data source，不可直接 query） */
export const NOTION_STORE2_DAILY_DB_ID = '13507d21-c964-80e0-944c-f8d1d2953ff0';
/** 文一店「筋棧文一店每日紀錄」data source（實際流水資料） */
export const NOTION_STORE2_DAILY_DATA_SOURCE_ID = '13507d21-c964-8180-9711-000bee4840f8';

const NOTION_DATA_SOURCE_QUERY_IDS = new Set([
  NOTION_STORE1_DAILY_DATA_SOURCE_ID,
  NOTION_STORE2_DAILY_DATA_SOURCE_ID,
]);

export const NOTION_DAILY_DB_BY_STORE: Record<StoreSlug, string> = {
  store1: NOTION_STORE1_DAILY_DATA_SOURCE_ID,
  store2: NOTION_STORE2_DAILY_DATA_SOURCE_ID,
};

export function getNotionDailyDbId(storeId: StoreSlug): string {
  return NOTION_DAILY_DB_BY_STORE[storeId];
}

export function storeIdFromNotionDailyDbId(databaseId: string): StoreSlug {
  if (databaseId === NOTION_STORE2_DAILY_DATA_SOURCE_ID || databaseId === NOTION_STORE2_DAILY_DB_ID) {
    return 'store2';
  }
  return 'store1';
}

function isDataSourceQueryId(id: string): boolean {
  return NOTION_DATA_SOURCE_QUERY_IDS.has(id);
}

function notionVersionForQueryId(id: string): string {
  return isDataSourceQueryId(id) ? NOTION_VERSION_MULTI_SOURCE : NOTION_VERSION;
}

function queryUrlForId(id: string): string {
  if (isDataSourceQueryId(id)) {
    return `https://api.notion.com/v1/data_sources/${id}/query`;
  }
  return `https://api.notion.com/v1/databases/${id}/query`;
}

function probeUrlForId(id: string): string {
  if (isDataSourceQueryId(id)) {
    return `https://api.notion.com/v1/data_sources/${id}`;
  }
  return `https://api.notion.com/v1/databases/${id}`;
}

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
  serviceHours: number | null;
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
  const apiVersion = notionVersionForQueryId(databaseId);

  const res = await fetch(probeUrlForId(databaseId), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': apiVersion,
    },
  });

  if (res.ok) {
    const data = (await res.json()) as {
      title?: { plain_text: string }[];
      name?: string;
    };
    const databaseTitle =
      data.name ||
      (data.title ?? []).map((t) => t.plain_text).join('') ||
      undefined;
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
      '金鑰有效但找不到資料庫。請在 Notion 每日紀錄資料庫 → ⋯ → Connect to → 選同一個 Integration（民有店、文一店都要連）。';
  } else if (notionCode === 'multiple_data_sources_for_database') {
    hint =
      '此 Notion 資料庫含多個 data source，請 Redeploy 最新版程式（民有店、文一店皆需改用 data source ID 查詢）。';
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

/** 從 Notion 每日紀錄資料庫讀取「師傅」select 選項（與 Notion UI 下拉一致） */
export async function fetchNotionStaffSelectOptions(
  storeId: StoreSlug,
): Promise<string[]> {
  const token = readNotionTokenFromEnv();
  if (!token) return [];

  const databaseId = getNotionDailyDbId(storeId);
  const staffProperty = getNotionPropertyName('師傅', storeId);
  const res = await fetch(probeUrlForId(databaseId), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': notionVersionForQueryId(databaseId),
    },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    properties?: Record<
      string,
      { type?: string; select?: { options?: { name: string }[] } }
    >;
  };
  const prop = data.properties?.[staffProperty];
  if (prop?.type !== 'select' || !prop.select?.options) return [];

  return prop.select.options
    .map((o) => o.name.trim())
    .filter((name) => name.length > 0);
}

function wrapNotionError(status: number, body: string): Error {
  if (status === 401) {
    return new Error(
      'Notion API 金鑰無效 (401)。請到 notion.so/my-integrations 複製 Internal Integration Secret，貼到 Vercel 的 NOTION_API_KEY，確認資料庫已 Connect to 該 Integration，然後 Redeploy。',
    );
  }
  if (status === 404) {
    return new Error(
      '找不到 Notion 資料庫 (404)。請在該店「每日紀錄」右上角 ⋯ → Connect to → 選你的 Integration。',
    );
  }
  if (status === 400 && body.includes('multiple_data_sources_for_database')) {
    return new Error(
      'Notion 資料庫含多個 data source，請 Redeploy 最新版程式後再同步（民有店、文一店皆已改用 data source）。',
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

function textFromNote(
  prop: { rich_text?: { plain_text: string }[]; text?: string } | undefined,
): string {
  const rich = textFromRichText(prop);
  if (rich) return rich;
  return typeof prop?.text === 'string' ? prop.text.trim() : '';
}

function selectName(prop: { select?: { name: string } | null } | undefined): string | null {
  return prop?.select?.name ?? null;
}

function numberValue(prop: { number?: number | null } | undefined): number {
  const n = prop?.number;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function numberValueOrNull(prop: { number?: number | null } | undefined): number | null {
  if (!prop || prop.number == null) return null;
  const n = prop.number;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function dateStart(prop: { date?: { start: string } | null } | undefined): string | null {
  return prop?.date?.start ?? null;
}

function checkboxValue(prop: { checkbox?: boolean } | undefined): boolean {
  return Boolean(prop?.checkbox);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNotionPage(page: any, storeId: StoreSlug): NotionDailyRow {
  const props = (page.properties ?? {}) as Record<string, unknown>;
  const titleProp = getNotionProperty(props, '名稱電話', storeId);
  const title =
    textFromRich(titleProp as { title?: { plain_text: string }[] } | undefined) ||
    page.id;

  const amountProp = getNotionProperty(props, '金額數字', storeId);
  const amount = numberValueOrNull(
    amountProp as { number?: number | null } | undefined,
  ) ?? 0;

  const serviceTypeProp = getNotionProperty(props, '消費類型', storeId);
  const staffProp = getNotionProperty(props, '師傅', storeId);
  const designatedProp = getNotionProperty(props, '指定', storeId);
  const noteProp = getNotionProperty(props, '會員備註', storeId);
  const dateProp = getNotionProperty(props, 'Date', storeId);
  const serviceHoursProp = getNotionProperty(props, '時數', storeId);

  return {
    pageId: page.id,
    title,
    dateStart: dateStart(dateProp as { date?: { start: string } | null } | undefined),
    amount,
    serviceType: selectName(
      serviceTypeProp as { select?: { name: string } | null } | undefined,
    ),
    paymentMethods: resolveCanonicalPaymentMethods(props, storeId, title),
    staffName: selectName(staffProp as { select?: { name: string } | null } | undefined),
    isDesignated: checkboxValue(designatedProp as { checkbox?: boolean } | undefined),
    memberNote:
      textFromNote(noteProp as { rich_text?: { plain_text: string }[]; text?: string } | undefined) ||
      null,
    lastEdited: page.last_edited_time ?? null,
    serviceHours: numberValueOrNull(
      serviceHoursProp as { number?: number | null } | undefined,
    ),
  };
}

export async function queryNotionDatabaseAll(
  databaseId: string,
  pageSize = 100,
): Promise<NotionDailyRow[]> {
  const storeId = storeIdFromNotionDailyDbId(databaseId);
  const rows: NotionDailyRow[] = [];
  let cursor: string | undefined;

  do {
    const res = await fetch(queryUrlForId(databaseId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken()}`,
        'Notion-Version': notionVersionForQueryId(databaseId),
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
      rows.push(mapNotionPage(page, storeId));
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

export interface CreateNotionDailyPageInput {
  title: string;
  date: string;
  amount: number;
  serviceType: string;
  staffName?: string | null;
  paymentMethods?: string[];
}

function notionVersionForStore(storeId: StoreSlug): string {
  return storeId === 'store2' ? NOTION_VERSION_MULTI_SOURCE : NOTION_VERSION;
}

function createPageParentsForStore(storeId: StoreSlug): Record<string, string>[] {
  if (storeId === 'store2') {
    return [
      { data_source_id: NOTION_STORE2_DAILY_DATA_SOURCE_ID },
      { database_id: NOTION_STORE2_DAILY_DB_ID },
    ];
  }
  return [
    { data_source_id: NOTION_STORE1_DAILY_DATA_SOURCE_ID },
    { database_id: NOTION_STORE1_DAILY_DB_ID },
  ];
}

/** 在指定分店每日紀錄資料庫新增一頁，回傳新 pageId */
export async function createNotionPageForStore(
  storeId: StoreSlug,
  properties: Record<string, unknown>,
): Promise<string> {
  const parents = createPageParentsForStore(storeId);
  let lastError: Error | null = null;

  for (const parent of parents) {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken()}`,
        'Notion-Version': notionVersionForStore(storeId),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent, properties }),
    });

    if (res.ok) {
      const data = (await res.json()) as { id: string };
      return data.id;
    }

    const body = await res.text();
    lastError = wrapNotionError(res.status, body);
    if (res.status !== 400) break;
  }

  throw lastError ?? new Error('建立 Notion 頁面失敗');
}

/** 在 store1 每日紀錄資料庫新增一頁，回傳新 pageId */
export async function createNotionDailyPage(
  input: CreateNotionDailyPageInput,
  databaseId = NOTION_STORE1_DAILY_DB_ID,
): Promise<string> {
  const properties: Record<string, unknown> = {
    名稱電話: { title: [{ type: 'text', text: { content: input.title } }] },
    Date: { date: { start: input.date } },
    金額數字: { number: input.amount },
    消費類型: { select: { name: input.serviceType } },
  };
  if (input.staffName) properties['師傅'] = { select: { name: input.staffName } };
  if (input.paymentMethods?.length) {
    properties['付款方式'] = { multi_select: input.paymentMethods.map((name) => ({ name })) };
  }
  const hours = computeServiceHours(input.title, input.serviceType);
  if (hours != null) {
    properties['時數'] = { number: hours };
  }

  if (databaseId !== NOTION_STORE1_DAILY_DB_ID) {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken()}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw wrapNotionError(res.status, body);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  return createNotionPageForStore('store1', properties);
}

export function buildNotionStaffUpdate(staffName: string) {
  return {
    師傅: {
      select: { name: staffName },
    },
  };
}

export function buildNotionPaymentUpdate(paymentMethods: string[]) {
  return {
    付款方式: {
      multi_select: paymentMethods.map((name) => ({ name })),
    },
  };
}

export function buildNotionServiceHoursUpdate(
  hours: number | null,
  storeId: StoreSlug,
): Record<string, unknown> {
  const propName = getNotionPropertyName('時數', storeId);
  return {
    [propName]: { number: hours },
  };
}

export async function syncNotionServiceHours(
  pageId: string,
  storeId: StoreSlug,
  title: string,
  category: string,
): Promise<void> {
  const hours = computeServiceHours(title, category);
  await updateNotionPageProperties(
    pageId,
    buildNotionServiceHoursUpdate(hours, storeId),
  );
}

/** 同步 Notion 時數欄位；僅在計算值與現值不同時寫入 */
export async function batchSyncNotionServiceHours(
  rows: NotionDailyRow[],
  storeId: StoreSlug,
  getCategory: (row: NotionDailyRow) => string,
): Promise<number> {
  let updated = 0;
  for (const row of rows) {
    const computed = computeServiceHours(row.title, getCategory(row));
    if (serviceHoursEqual(computed, row.serviceHours)) continue;
    await updateNotionPageProperties(
      row.pageId,
      buildNotionServiceHoursUpdate(computed, storeId),
    );
    updated += 1;
  }
  return updated;
}

/** 封存（刪除）Notion 頁面 */
export async function archiveNotionPage(pageId: string): Promise<void> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ archived: true }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw wrapNotionError(res.status, body);
  }
}

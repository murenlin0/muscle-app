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

function notionToken(): string {
  const token = process.env.NOTION_API_KEY?.trim();
  if (!token) {
    throw new Error('缺少 NOTION_API_KEY 環境變數');
  }
  return token;
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
      throw new Error(`Notion query 失敗 (${res.status}): ${body}`);
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
    throw new Error(`Notion 更新失敗 ${pageId} (${res.status}): ${body}`);
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

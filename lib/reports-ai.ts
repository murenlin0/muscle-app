import { STORE_TIMEZONE } from '@/lib/store-timezone';
import { STORE_LIST, type StoreSlug } from '@/lib/stores';
import {
  TRANSACTION_CATEGORIES,
  type LedgerAccountFilter,
  type TransactionCategory,
} from '@/lib/transaction-category';
import type { StaffRosterEntry } from '@/lib/staff-auth-server';

const GROQ_MODEL = process.env.GROQ_REPORTS_MODEL ?? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

function readGroqKey(): string {
  const raw = process.env.GROQ_API_KEY;
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

export function isReportsAiConfigured(): boolean {
  return Boolean(readGroqKey());
}

export class ReportsAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportsAiError';
  }
}

/** 使用者明確要求跨店合計（僅此時可不加 store 篩選） */
export function asksAllStoresReport(question: string): boolean {
  return /全部分店|兩店合計|全部店|兩店總|所有分店|各店合計|兩店加總/.test(question);
}

/** AI 解析出的報表查詢意圖 */
export interface ReportQueryIntent {
  /** filter＝只設篩選；sum＝加總金額；count＝筆數；salary＝估算師傅薪資；staff_hours＝各師傅服務時數 */
  intent: 'filter' | 'sum' | 'count' | 'salary' | 'staff_hours';
  from: string;
  to: string;
  store: StoreSlug | null;
  staffName: string | null;
  categories: TransactionCategory[] | null;
  account: LedgerAccountFilter | null;
  /** 薪資估算：時薪（每小時金額） */
  hourlyRate: number | null;
  /** 薪資估算：調薪生效日（含當日）之後使用 hourlyRate，之前使用 priorRate */
  rateEffectiveFrom: string | null;
  priorRate: number | null;
  /** AI 對問題的繁體中文簡短重述 */
  explanation: string;
}

function taipeiToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function buildPrompt(question: string, roster: StaffRosterEntry[]): string {
  const today = taipeiToday();
  const year = today.slice(0, 4);
  const storeLines = STORE_LIST.map((s) => `- ${s.slug}（${s.name}）`).join('\n');
  const staffLines = roster.length
    ? roster.map((s) => `- ${s.display_name}（${s.store_name} / ${s.store_id}）`).join('\n')
    : '（無在職師傅清單）';
  const categoryLine = TRANSACTION_CATEGORIES.join('、');

  return `你是筋棧按摩店的報表查詢助手。使用者用口語提問，你要把問題轉成結構化查詢條件。今天是 ${today}（Asia/Taipei）。

可用分店（store）：
${storeLines}

在職師傅（staffName 須對應 display_name）：
${staffLines}

可用分類（categories，可多選）：${categoryLine}
- 收入/營業額類：一般消費、會員使用、會員補差額、收入、店租收入
- 支出類：支出、工資、分紅
- 「工資/薪水」對應分類「工資」

可用帳戶（account）：現金、富邦（沒提到就 null）

只回傳 JSON 物件，欄位：
{
  "intent": "filter" | "sum" | "count" | "salary" | "staff_hours",
  "from": "YYYY-MM-DD",
  "to": "YYYY-MM-DD",
  "store": store 代碼或 null,
  "staffName": 師傅 display_name 或 null,
  "categories": 分類字串陣列或 null,
  "account": "現金" | "富邦" | null,
  "hourlyRate": 數字或 null,
  "rateEffectiveFrom": "YYYY-MM-DD" 或 null,
  "priorRate": 數字或 null,
  "explanation": "一句繁體中文重述查詢條件"
}

規則：
- intent 判斷：問「多少錢/加總/總共（金額）」→ sum；問「幾筆/次數」→ count；問「薪水/薪資且有提到時薪」→ salary；問「每個/各/全部師傅的總時數/時數/工時/服務時數」→ staff_hours（不是 sum）；只是要看明細→ filter
- 「6/1~6/15」「6月1日到15日」等未寫年份的日期 → ${year}-06-01 ~ ${year}-06-15（未指定年份則用 ${year}）
- 「今年」= ${year}-01-01 ~ ${today}；「上個月/本月」依今天推算；沒講日期就用今年至今
- staff_hours：categories 固定 null（後端會依服務時數規則篩選）；staffName 固定 null（要列出全部師傅）
- salary：hourlyRate 為調整後時薪，rateEffectiveFrom 為調薪生效日，priorRate 為調整前時薪（沒提到就 null）
- 只輸出 JSON，不要 markdown 或多餘文字

問題：
"""
${question.trim()}
"""`;
}

function normalizeIntent(raw: Record<string, unknown>): ReportQueryIntent {
  const today = taipeiToday();
  const year = today.slice(0, 4);

  const asString = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const asNumber = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const intentRaw = asString(raw.intent);
  const intent: ReportQueryIntent['intent'] =
    intentRaw === 'sum' ||
    intentRaw === 'count' ||
    intentRaw === 'salary' ||
    intentRaw === 'staff_hours'
      ? intentRaw
      : 'filter';

  const storeRaw = asString(raw.store);
  const store = STORE_LIST.some((s) => s.slug === storeRaw)
    ? (storeRaw as StoreSlug)
    : null;

  const categoriesRaw = Array.isArray(raw.categories) ? raw.categories : null;
  const categories = categoriesRaw
    ? categoriesRaw
        .map((c) => (typeof c === 'string' ? c.trim() : ''))
        .filter((c): c is TransactionCategory =>
          (TRANSACTION_CATEGORIES as readonly string[]).includes(c),
        )
    : null;

  const accountRaw = asString(raw.account);
  const account: LedgerAccountFilter | null =
    accountRaw === '現金' || accountRaw === '富邦' ? accountRaw : null;

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = asString(raw.from);
  const to = asString(raw.to);

  return {
    intent,
    from: from && dateRe.test(from) ? from : `${year}-01-01`,
    to: to && dateRe.test(to) ? to : today,
    store,
    staffName: asString(raw.staffName),
    categories: categories && categories.length ? categories : null,
    account,
    hourlyRate: asNumber(raw.hourlyRate),
    rateEffectiveFrom:
      asString(raw.rateEffectiveFrom) && dateRe.test(String(raw.rateEffectiveFrom))
        ? String(raw.rateEffectiveFrom)
        : null,
    priorRate: asNumber(raw.priorRate),
    explanation: asString(raw.explanation) ?? '已解析查詢條件',
  };
}

export async function extractReportQuery(
  question: string,
  roster: StaffRosterEntry[],
): Promise<ReportQueryIntent> {
  const apiKey = readGroqKey();
  if (!apiKey) {
    throw new ReportsAiError('AI 尚未啟用，請設定 GROQ_API_KEY');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是報表查詢解析助手。只回傳 JSON 物件，不要 markdown 或其他文字。',
        },
        { role: 'user', content: buildPrompt(question, roster) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 429) {
      throw new ReportsAiError('AI 請求過於頻繁，請稍後再試');
    }
    if (response.status === 401 || response.status === 403) {
      throw new ReportsAiError('GROQ_API_KEY 無效，請重新設定金鑰');
    }
    throw new ReportsAiError(
      `AI 解析失敗（${response.status}）${detail ? `：${detail.slice(0, 160)}` : ''}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawJson = payload.choices?.[0]?.message?.content;
  if (!rawJson) throw new ReportsAiError('AI 未回傳解析結果');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    throw new ReportsAiError('AI 回傳格式無法解析');
  }

  return normalizeIntent(parsed);
}

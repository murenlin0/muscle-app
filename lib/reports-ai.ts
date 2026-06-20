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

const REPORT_QUERY_INTENTS = [
  'filter',
  'sum',
  'count',
  'salary',
  'staff_hours',
  'overview',
  'net_profit',
  'expense_breakdown',
  'compare',
  'client_stats',
  'multi_account',
  'top_n',
] as const;

export type ReportQueryIntentType = (typeof REPORT_QUERY_INTENTS)[number];

export type ClientStatsMode = 'no_phone' | 'vip_count' | 'balance_by_name';

export type CompareMetric = 'revenue' | 'expense' | 'net_profit' | 'hours' | 'cash' | 'all';

export type TopNType = 'staff_hours' | 'staff_revenue' | 'client_revenue' | 'client_visits';

/** AI 解析出的報表查詢意圖（僅讀取，不修改資料） */
export interface ReportQueryIntent {
  intent: ReportQueryIntentType;
  from: string;
  to: string;
  store: StoreSlug | null;
  staffName: string | null;
  categories: TransactionCategory[] | null;
  account: LedgerAccountFilter | null;
  hourlyRate: number | null;
  rateEffectiveFrom: string | null;
  priorRate: number | null;
  explanation: string;
  /** 使用者要求修改資料時設 true */
  blocked: boolean;
  blockedMessage: string | null;
  clientStatsMode: ClientStatsMode | null;
  clientNameQuery: string | null;
  compareFrom: string | null;
  compareTo: string | null;
  compareMetric: CompareMetric | null;
  topN: number | null;
  topNType: TopNType | null;
}

/** 偵測修改/同步類請求（Groq 備援） */
export function detectModifyRequest(question: string): string | null {
  const q = question.trim();
  if (!q) return null;
  if (/同步|匯入|寫入|覆寫/.test(q)) {
    return '僅支援查詢與統計，無法同步或寫入資料。';
  }
  if (/刪除|刪掉|移除紀錄/.test(q)) {
    return '僅支援查詢與統計，無法刪除資料。';
  }
  if (/新增.*(?:紀錄|筆|資料|帳目)|建立.*(?:紀錄|帳目)/.test(q)) {
    return '僅支援查詢與統計，無法新增資料。';
  }
  if (/改(?:標題|內容|金額|分類|師傅|日期|帳目|紀錄)|修改(?:資料|紀錄|帳目|金額)/.test(q)) {
    return '僅支援查詢與統計，無法修改資料。';
  }
  return null;
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
  const intentLine = REPORT_QUERY_INTENTS.map((i) => `"${i}"`).join(' | ');

  return `你是筋棧按摩店的報表查詢助手。使用者用口語提問，你要把問題轉成結構化「唯讀查詢」條件。今天是 ${today}（Asia/Taipei）。

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
  "blocked": false,
  "blockedMessage": null,
  "intent": ${intentLine},
  "from": "YYYY-MM-DD",
  "to": "YYYY-MM-DD",
  "store": store 代碼或 null,
  "staffName": 師傅 display_name 或 null,
  "categories": 分類字串陣列或 null,
  "account": "現金" | "富邦" | null,
  "hourlyRate": 數字或 null,
  "rateEffectiveFrom": "YYYY-MM-DD" 或 null,
  "priorRate": 數字或 null,
  "clientStatsMode": "no_phone" | "vip_count" | "balance_by_name" | null,
  "clientNameQuery": 客人姓名或 null,
  "compareFrom": "YYYY-MM-DD" 或 null,
  "compareTo": "YYYY-MM-DD" 或 null,
  "compareMetric": "revenue" | "expense" | "net_profit" | "hours" | "cash" | "all" | null,
  "topN": 整數或 null,
  "topNType": "staff_hours" | "staff_revenue" | "client_revenue" | "client_visits" | null,
  "explanation": "一句繁體中文重述查詢條件"
}

【禁止修改資料】若使用者要求改/刪/新增/同步/寫入/匯入資料或帳目，設 blocked=true，blockedMessage="僅支援查詢與統計，無法修改、新增或刪除資料。"，其餘欄位可省略。

【intent 判斷】
- overview：財務總覽、整體狀況、營業額成本淨利資產一次看
- net_profit：淨利、賺多少、獲利
- expense_breakdown：成本明細、房租水電師傅薪水支出結構
- compare：本月 vs 上個月、跟去年比、兩段期間比較
- multi_account：現金加富邦、帳戶加總
- client_stats + clientStatsMode：
  - no_phone：沒電話的客人有幾個
  - vip_count：VIP 會員人數
  - balance_by_name：依姓名查會員餘額（clientNameQuery 填姓名）
- top_n + topN + topNType：前 N 名師傅/客人（時數、營業額、來店次數）
- sum：加總金額；count：筆數；salary：時薪估算；staff_hours：各師傅時數；filter：只看明細

【日期解析】
- 「6/1~6/15」「6月1日到15日」→ ${year}-06-01 ~ ${year}-06-15
- 「去年5月」→ ${Number(year) - 1}-05-01 ~ ${Number(year) - 1}-05-31
- 「這季/本季」→ 當季第一天 ~ ${today}
- 「今年」→ ${year}-01-01 ~ ${today}；「上個月/本月」依今天推算
- compare：from/to=本期；compareFrom/compareTo=對照期（例：本月 vs 上個月 → 本期=本月，對照=上個月）；沒指定對照期可留 null（後端自動推前一段）
- 沒講日期：overview/multi_account 用今年至今；其餘依語意

【其他規則】
- store：使用者沒指定分店 → null（後端用畫面分店）；明確說某店才填 store
- staff_hours：categories=null；staffName=null（列全部師傅）
- salary：需 hourlyRate；調薪則填 rateEffectiveFrom、priorRate
- topN 預設 5
- 只輸出 JSON，不要 markdown

範例：
- 「今年淨利多少」→ intent=net_profit, from=${year}-01-01, to=${today}
- 「上個月房租水電支出」→ intent=expense_breakdown, from/to=上個月
- 「本月跟上個月營業額比較」→ intent=compare, compareMetric=revenue
- 「現金加富邦多少」→ intent=multi_account
- 「沒電話的客人幾個」→ intent=client_stats, clientStatsMode=no_phone
- 「VIP 有幾個」→ intent=client_stats, clientStatsMode=vip_count
- 「王小明餘額」→ intent=client_stats, clientStatsMode=balance_by_name, clientNameQuery=王小明
- 「前3名師傅時數」→ intent=top_n, topN=3, topNType=staff_hours
- 「幫我刪除這筆」→ blocked=true

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
  const asInt = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(Math.round(n), 50);
  };

  const blocked = raw.blocked === true;
  const blockedMessage = asString(raw.blockedMessage);

  const intentRaw = asString(raw.intent);
  const intent: ReportQueryIntentType = (REPORT_QUERY_INTENTS as readonly string[]).includes(
    intentRaw ?? '',
  )
    ? (intentRaw as ReportQueryIntentType)
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

  const clientStatsRaw = asString(raw.clientStatsMode);
  const clientStatsMode: ClientStatsMode | null =
    clientStatsRaw === 'no_phone' ||
    clientStatsRaw === 'vip_count' ||
    clientStatsRaw === 'balance_by_name'
      ? clientStatsRaw
      : null;

  const compareMetricRaw = asString(raw.compareMetric);
  const compareMetric: CompareMetric | null =
    compareMetricRaw === 'revenue' ||
    compareMetricRaw === 'expense' ||
    compareMetricRaw === 'net_profit' ||
    compareMetricRaw === 'hours' ||
    compareMetricRaw === 'cash' ||
    compareMetricRaw === 'all'
      ? compareMetricRaw
      : null;

  const topNTypeRaw = asString(raw.topNType);
  const topNType: TopNType | null =
    topNTypeRaw === 'staff_hours' ||
    topNTypeRaw === 'staff_revenue' ||
    topNTypeRaw === 'client_revenue' ||
    topNTypeRaw === 'client_visits'
      ? topNTypeRaw
      : null;

  const compareFrom = asString(raw.compareFrom);
  const compareTo = asString(raw.compareTo);

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
    blocked,
    blockedMessage,
    clientStatsMode,
    clientNameQuery: asString(raw.clientNameQuery),
    compareFrom: compareFrom && dateRe.test(compareFrom) ? compareFrom : null,
    compareTo: compareTo && dateRe.test(compareTo) ? compareTo : null,
    compareMetric,
    topN: asInt(raw.topN),
    topNType,
  };
}

export async function extractReportQuery(
  question: string,
  roster: StaffRosterEntry[],
): Promise<ReportQueryIntent> {
  const modifyBlock = detectModifyRequest(question);
  if (modifyBlock) {
    return {
      intent: 'filter',
      from: taipeiToday(),
      to: taipeiToday(),
      store: null,
      staffName: null,
      categories: null,
      account: null,
      hourlyRate: null,
      rateEffectiveFrom: null,
      priorRate: null,
      explanation: '修改資料請求',
      blocked: true,
      blockedMessage: modifyBlock,
      clientStatsMode: null,
      clientNameQuery: null,
      compareFrom: null,
      compareTo: null,
      compareMetric: null,
      topN: null,
      topNType: null,
    };
  }

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
          content:
            '你是報表查詢解析助手。只回傳 JSON 物件，不要 markdown 或其他文字。絕不可將修改/刪除/新增/同步請求解析為查詢 intent，應設 blocked=true。',
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

  const intent = normalizeIntent(parsed);
  if (intent.blocked) {
    intent.blockedMessage =
      intent.blockedMessage ?? '僅支援查詢與統計，無法修改、新增或刪除資料。';
  }
  return intent;
}

/** 統計類 intent 不套用流水帳細部篩選 */
export function intentSkipsLedgerFilter(intent: ReportQueryIntentType): boolean {
  return [
    'overview',
    'net_profit',
    'expense_breakdown',
    'compare',
    'client_stats',
    'multi_account',
    'top_n',
    'staff_hours',
    'salary',
  ].includes(intent);
}

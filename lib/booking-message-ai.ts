import { normalizePhone, stripAllSpaces } from '@/lib/phone';
import {
  buildFromFlexibleFields,
  validateRequiredBookingFields,
  type FlexibleBookingFields,
} from '@/lib/booking-message-flex';
import type { BookingMessageData } from '@/lib/booking-message';
import { parseStoreDateTime, STORE_TIMEZONE } from '@/lib/store-timezone';
import {
  getStore,
  resolveStoreSlugFromMessageLabel,
  STORE_LIST,
  type StoreSlug,
} from '@/lib/stores';
import type { StaffRosterEntry } from '@/lib/staff-auth-server';

const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

interface AiBookingResponse {
  status: 'complete' | 'incomplete';
  message?: string | null;
  storeLabel?: string | null;
  staffName?: string | null;
  clientName?: string | null;
  phone?: string | null;
  serviceLabel?: string | null;
  durationMinutes?: number | null;
  startsAtLocal?: string | null;
  note?: string | null;
}

export type AiBookingParseResult =
  | { status: 'complete'; data: BookingMessageData }
  | { status: 'incomplete'; message: string };

export class BookingParseIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingParseIncompleteError';
  }
}

function taipeiNowParts(ref = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ref);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function buildPrompt(text: string, roster: StaffRosterEntry[]): string {
  const { date, time } = taipeiNowParts();
  const storeLines = STORE_LIST.map(
    (s) => `- ${s.messageStoreLabel}（${s.name}）`,
  ).join('\n');
  const staffLines = roster.length
    ? roster.map((s) => `- ${s.display_name}（${s.store_name}）`).join('\n')
    : '（無在職師傅清單）';

  return `你是筋棧按摩店的預約訊息解析助手。師傅會貼上從 LINE 複製的訊息，格式不拘（可無標題、口語、欄位順序任意、錯字可容忍）。

必要欄位（六項皆須能從訊息確定才可 complete）：
1. 店名（對應以下其一）
${storeLines}
2. 師傅（對應在職師傅 display_name；可從「師傅：」、日曆標題前綴、或口語判斷）
${staffLines}
3. 客人姓名
4. 電話（台灣手機 09 開頭 10 碼）
5. 時長（僅 30、60、90、120 分鐘；項目可寫「運動按摩 {N}min」）
6. 預約時間（startsAtLocal 格式 YYYY-MM-DD HH:mm，Asia/Taipei；若只有月日或口語，以今天 ${date} ${time} 推斷）

只回傳 JSON 物件，欄位：
status, message, storeLabel, staffName, clientName, phone, serviceLabel, durationMinutes, startsAtLocal, note

規則：
- 六項齊全且可確定 → status="complete"，填齊各欄位，message=null
- 任一無法確定 → status="incomplete"，message 用一句繁體中文簡短說明缺少什麼（例如「缺少電話與預約時間」），不超過 40 字
- 勿猜測電話或姓名；不確定就 incomplete

訊息：
"""
${text.trim()}
"""`;
}

function parseStartsAtLocal(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const normalized = raw.trim().replace('T', ' ');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  return parseStoreDateTime(Number(y), Number(mo), Number(d), Number(h), Number(mi));
}

function resolveStaffName(
  raw: string | null | undefined,
  storeSlug: StoreSlug | null,
  roster: StaffRosterEntry[],
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const pool = storeSlug ? roster.filter((s) => s.store_id === storeSlug) : roster;
  const names = pool.map((s) => s.display_name);

  if (names.includes(trimmed)) return trimmed;

  const byPrefix = names.find((n) => n.startsWith(trimmed) || trimmed.startsWith(n));
  if (byPrefix) return byPrefix;

  const byContains = names.find((n) => n.includes(trimmed) || trimmed.includes(n));
  if (byContains) return byContains;

  return trimmed;
}

function aiResponseToFields(
  extract: AiBookingResponse,
  roster: StaffRosterEntry[],
): FlexibleBookingFields {
  const storeLabel = extract.storeLabel?.trim() || null;
  const storeSlug = storeLabel ? resolveStoreSlugFromMessageLabel(storeLabel) : null;
  const phone = extract.phone ? normalizePhone(extract.phone) : null;
  const durationMinutes =
    extract.durationMinutes && [30, 60, 90, 120].includes(extract.durationMinutes)
      ? extract.durationMinutes
      : null;

  return {
    storeLabel: storeSlug ? getStore(storeSlug)?.messageStoreLabel ?? storeLabel : storeLabel,
    storeSlug,
    clientName: extract.clientName ? stripAllSpaces(extract.clientName) : null,
    phone,
    durationMinutes,
    serviceLabel:
      extract.serviceLabel?.trim() ||
      (durationMinutes ? `運動按摩 ${durationMinutes}min` : null),
    startsAt: parseStartsAtLocal(extract.startsAtLocal),
    staffName: resolveStaffName(extract.staffName, storeSlug, roster),
    note: extract.note?.trim() || null,
  };
}

function missingFieldsMessage(fields: FlexibleBookingFields): string {
  const missing: string[] = [];
  if (!fields.storeSlug) missing.push('店名');
  if (!fields.staffName?.trim()) missing.push('師傅');
  if (!fields.clientName?.trim()) missing.push('姓名');
  if (!fields.phone) missing.push('電話');
  if (!fields.durationMinutes) missing.push('時長');
  if (!fields.startsAt) missing.push('預約時間');
  return missing.length ? `缺少${missing.join('、')}` : '無法解析此訊息';
}

function fieldsToBookingData(fields: FlexibleBookingFields): BookingMessageData {
  validateRequiredBookingFields(fields);
  if (!fields.staffName?.trim()) {
    throw new BookingParseIncompleteError('缺少師傅');
  }
  const built = buildFromFlexibleFields(fields);
  const store = getStore(built.storeSlug);
  return {
    ...built,
    staffName: fields.staffName.trim(),
    storeLabel: store?.messageStoreLabel ?? built.storeLabel,
  };
}

function parseAiJson(raw: string): AiBookingResponse {
  try {
    return JSON.parse(raw) as AiBookingResponse;
  } catch {
    throw new Error('AI 回傳格式無法解析');
  }
}

async function callGroqParse(
  text: string,
  roster: StaffRosterEntry[],
): Promise<AiBookingResponse> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('尚未設定 GROQ_API_KEY');
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
          content: '你是筋棧預約訊息解析助手。只回傳 JSON 物件，不要 markdown 或其他文字。',
        },
        { role: 'user', content: buildPrompt(text, roster) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 429) {
      throw new BookingParseIncompleteError('AI 請求過於頻繁，請稍後再試');
    }
    if (response.status === 401 || response.status === 403) {
      throw new BookingParseIncompleteError('GROQ_API_KEY 無效，請檢查金鑰');
    }
    throw new Error(`Groq 解析失敗（${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawJson = payload.choices?.[0]?.message?.content;
  if (!rawJson) throw new Error('AI 未回傳解析結果');
  return parseAiJson(rawJson);
}

async function callGeminiParse(
  text: string,
  roster: StaffRosterEntry[],
): Promise<AiBookingResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('尚未設定 GEMINI_API_KEY');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(text, roster) }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['complete', 'incomplete'] },
            message: { type: 'string', nullable: true },
            storeLabel: { type: 'string', nullable: true },
            staffName: { type: 'string', nullable: true },
            clientName: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            serviceLabel: { type: 'string', nullable: true },
            durationMinutes: { type: 'integer', nullable: true },
            startsAtLocal: { type: 'string', nullable: true },
            note: { type: 'string', nullable: true },
          },
          required: ['status'],
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 429) {
      if (detail.includes('limit: 0')) {
        throw new BookingParseIncompleteError(
          'Gemini 免費額度尚未啟用，建議改用 Groq（設定 GROQ_API_KEY）',
        );
      }
      throw new BookingParseIncompleteError('AI 額度已用完，請稍後再試');
    }
    if (response.status === 401 || response.status === 403) {
      throw new BookingParseIncompleteError('GEMINI_API_KEY 無效');
    }
    throw new Error(`Gemini 解析失敗（${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawJson = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJson) throw new Error('AI 未回傳解析結果');
  return parseAiJson(rawJson);
}

async function callAiParse(
  text: string,
  roster: StaffRosterEntry[],
): Promise<AiBookingResponse> {
  if (isGroqConfigured()) {
    return callGroqParse(text, roster);
  }
  if (isGeminiConfigured()) {
    return callGeminiParse(text, roster);
  }
  throw new BookingParseIncompleteError(
    'AI 解析尚未啟用，請在 Vercel 或 .env.local 設定 GROQ_API_KEY',
  );
}

export async function parseBookingMessageWithAiEx(
  text: string,
  roster: StaffRosterEntry[],
): Promise<AiBookingParseResult> {
  const response = await callAiParse(text, roster);

  if (response.status === 'incomplete') {
    const message = response.message?.trim() || '無法解析此訊息，請補齊必要資訊';
    return { status: 'incomplete', message };
  }

  const fields = aiResponseToFields(response, roster);
  try {
    return { status: 'complete', data: fieldsToBookingData(fields) };
  } catch (e) {
    if (e instanceof BookingParseIncompleteError) {
      return { status: 'incomplete', message: e.message };
    }
    return { status: 'incomplete', message: missingFieldsMessage(fields) };
  }
}

export async function parseBookingMessageWithAi(
  text: string,
  roster: StaffRosterEntry[],
): Promise<BookingMessageData> {
  const result = await parseBookingMessageWithAiEx(text, roster);
  if (result.status === 'incomplete') {
    throw new BookingParseIncompleteError(result.message);
  }
  return result.data;
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function isBookingAiConfigured(): boolean {
  return isGroqConfigured() || isGeminiConfigured();
}

export function assertBookingAiConfigured(): void {
  if (!isBookingAiConfigured()) {
    throw new BookingParseIncompleteError(
      'AI 解析尚未啟用，請在 Vercel 或 .env.local 設定 GROQ_API_KEY',
    );
  }
}

/** @deprecated 請改用 assertBookingAiConfigured */
export function assertGeminiConfigured(): void {
  assertBookingAiConfigured();
}

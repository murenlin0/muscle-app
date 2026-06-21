import { normalizePhone, stripAllSpaces } from '@/lib/phone';
import {
  buildStaffMessageCore,
  type FlexibleBookingFields,
} from '@/lib/booking-message-flex';
import type { StaffUiParsedBooking } from '@/lib/booking-message';
import { parseStoreDateTime, STORE_TIMEZONE } from '@/lib/store-timezone';
import type { StaffRosterEntry } from '@/lib/staff-auth-server';

const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

function readEnvKey(name: 'GROQ_API_KEY' | 'GEMINI_API_KEY'): string {
  const raw = process.env[name];
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

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
  | { status: 'complete'; data: StaffUiParsedBooking }
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

function buildPrompt(text: string): string {
  const { date, time } = taipeiNowParts();

  return `你是筋棧按摩店的預約訊息解析助手。師傅會貼上從 LINE 複製的訊息，格式不拘（可無標題、口語、欄位順序任意、錯字可容忍）。

必要欄位（四項皆須能從訊息確定才可 complete；分店與負責師傅由畫面選單指定，勿解析）：
1. 客人姓名
2. 電話（台灣手機 09 開頭 10 碼）
3. 時長（僅 30、60、90、120 分鐘；項目可寫「運動按摩 {N}min」）
4. 預約時間（startsAtLocal 格式 YYYY-MM-DD HH:mm，Asia/Taipei；若只有月日或口語，以今天 ${date} ${time} 推斷）

只回傳 JSON 物件，欄位：
status, message, storeLabel, staffName, clientName, phone, serviceLabel, durationMinutes, startsAtLocal, note

規則：
- 四項齊全且可確定 → status="complete"，填齊各欄位（storeLabel、staffName 一律 null），message=null
- 任一無法確定 → status="incomplete"，message 用一句繁體中文簡短說明缺少什麼（例如「缺少電話與預約時間」），不超過 40 字；勿提及師傅或店名
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

function aiResponseToFields(
  extract: AiBookingResponse,
): FlexibleBookingFields {
  const phone = extract.phone ? normalizePhone(extract.phone) : null;
  const durationMinutes =
    extract.durationMinutes && [30, 60, 90, 120].includes(extract.durationMinutes)
      ? extract.durationMinutes
      : null;

  return {
    storeLabel: null,
    storeSlug: null,
    clientName: extract.clientName ? stripAllSpaces(extract.clientName) : null,
    phone,
    durationMinutes,
    serviceLabel:
      extract.serviceLabel?.trim() ||
      (durationMinutes ? `運動按摩 ${durationMinutes}min` : null),
    startsAt: parseStartsAtLocal(extract.startsAtLocal),
    staffName: null,
    note: extract.note?.trim() || null,
  };
}

function missingFieldsMessage(fields: FlexibleBookingFields): string {
  const missing: string[] = [];
  if (!fields.clientName?.trim()) missing.push('姓名');
  if (!fields.phone) missing.push('電話');
  if (!fields.durationMinutes) missing.push('時長');
  if (!fields.startsAt) missing.push('預約時間');
  return missing.length ? `缺少${missing.join('、')}` : '無法解析此訊息';
}

function fieldsToBookingData(fields: FlexibleBookingFields): StaffUiParsedBooking {
  return buildStaffMessageCore(fields);
}

function parseAiJson(raw: string): AiBookingResponse {
  try {
    return JSON.parse(raw) as AiBookingResponse;
  } catch {
    throw new Error('AI 回傳格式無法解析');
  }
}

async function callGroqParse(text: string): Promise<AiBookingResponse> {
  const apiKey = readEnvKey('GROQ_API_KEY');
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
        { role: 'user', content: buildPrompt(text) },
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
      throw new BookingParseIncompleteError(
        'GROQ_API_KEY 無效，請到 Vercel muscle-app-mivu 重新貼上 gsk_ 開頭的金鑰',
      );
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

async function callGeminiParse(text: string): Promise<AiBookingResponse> {
  const apiKey = readEnvKey('GEMINI_API_KEY');
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
      contents: [{ parts: [{ text: buildPrompt(text) }] }],
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

async function callAiParse(text: string): Promise<AiBookingResponse> {
  if (isGroqConfigured()) {
    return callGroqParse(text);
  }
  if (isGeminiConfigured()) {
    return callGeminiParse(text);
  }
  throw new BookingParseIncompleteError(
    'AI 解析尚未啟用，請在 Vercel 或 .env.local 設定 GROQ_API_KEY',
  );
}

export async function parseBookingMessageWithAiEx(
  text: string,
  _roster?: StaffRosterEntry[],
): Promise<AiBookingParseResult> {
  const response = await callAiParse(text);

  if (response.status === 'incomplete') {
    const message = response.message?.trim() || '無法解析此訊息，請補齊必要資訊';
    return { status: 'incomplete', message };
  }

  const fields = aiResponseToFields(response);
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
): Promise<StaffUiParsedBooking> {
  const result = await parseBookingMessageWithAiEx(text, roster);
  if (result.status === 'incomplete') {
    throw new BookingParseIncompleteError(result.message);
  }
  return result.data;
}

export function isGroqConfigured(): boolean {
  return Boolean(readEnvKey('GROQ_API_KEY'));
}

export function isGeminiConfigured(): boolean {
  return Boolean(readEnvKey('GEMINI_API_KEY'));
}

export async function probeGroqKey(): Promise<boolean> {
  const apiKey = readEnvKey('GROQ_API_KEY');
  if (!apiKey) return false;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: 'OK' }],
        max_tokens: 1,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
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

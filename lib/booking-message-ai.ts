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
  /** 供建立預約時回填文字框、重新解析用 */
  normalizedText?: string | null;
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
2. 電話（台灣手機 09 開頭 10 碼；OCR 常把 0 誤為 O，請修正）
3. 時長（僅 30、60、90、120 分鐘；項目可寫「運動按摩 {N}min」；「60分」「60min」皆視為 60）
4. 預約時間（startsAtLocal 格式 YYYY-MM-DD HH:mm，Asia/Taipei；若只有月日或口語，以今天 ${date} ${time} 推斷）
   - 若對話中多次改期或有多個時間，取雙方「最後確認、同意」的時間（例如客人回「好」「可以」「那就」之後的那個；勿用第一次提議或已取消的時間）

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

/** LINE 聊天截圖 OCR 後的文字解析（含改期對話） */
export function buildStaffChatOcrParsePrompt(text: string): string {
  const { date, time } = taipeiNowParts();

  return `你是筋棧按摩店的預約助手。以下是從 LINE 聊天「截圖 OCR」轉出的對話文字，每行可能含 [發話者] 前綴，請從整段對話判斷最終預約。

必要欄位（四項皆須能確定才可 complete；分店與師傅由 UI 選單指定，勿解析）：
1. 客人姓名（通常在官方確認訊息或客人自我介紹）
2. 電話（09 開頭 10 碼；OCR 可能缺數字或 O/0 混淆，合理修正）
3. 時長（30/60/90/120 分鐘）
4. 預約時間（startsAtLocal：YYYY-MM-DD HH:mm，Asia/Taipei）

【改期 — 最重要】
師傅可能與客人協調多個時段。請依對話順序（上→下）找「雙方最後確認」的時間：
- 客人回「好、可以、OK、沒問題、那就、行」等之後的時間為準
- 「改到」「換成」「改成」且後續被確認 → 用改後時間
- 勿用已被否定、僅詢問中、或第一次未確認的提議
- 若官方「預約確認」訊息與對話一致，可優先採用該則的時間
- 口語或只有月日，以今天 ${date} ${time} 推斷年份

只回傳 JSON：status, message, storeLabel, staffName, clientName, phone, serviceLabel, durationMinutes, startsAtLocal, note
- complete：四項齊全，storeLabel/staffName=null，message=null
- incomplete：message 一句繁體中文說缺什麼（≤40字）

對話 OCR 文字：
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

export function processAiBookingResponse(response: AiBookingResponse): AiBookingParseResult {
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

function parseAiJson(raw: string): AiBookingResponse {
  try {
    return JSON.parse(raw) as AiBookingResponse;
  } catch {
    throw new Error('AI 回傳格式無法解析');
  }
}

async function callGroqParse(text: string, prompt = buildPrompt(text)): Promise<AiBookingResponse> {
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
        { role: 'user', content: prompt },
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

async function callGeminiParse(text: string, prompt = buildPrompt(text)): Promise<AiBookingResponse> {
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
      contents: [{ parts: [{ text: prompt }] }],
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

async function callAiParse(text: string, prompt?: string): Promise<AiBookingResponse> {
  const userPrompt = prompt ?? buildPrompt(text);
  if (isGroqConfigured()) {
    return callGroqParse(text, userPrompt);
  }
  if (isGeminiConfigured()) {
    return callGeminiParse(text, userPrompt);
  }
  throw new BookingParseIncompleteError(
    'AI 解析尚未啟用，請在 Vercel 或 .env.local 設定 GROQ_API_KEY',
  );
}

/** 解析 LINE 聊天 OCR 文字（截圖第二步） */
export async function parseBookingChatTextWithAiEx(
  ocrText: string,
): Promise<AiBookingParseResult> {
  const response = await callAiParse(ocrText, buildStaffChatOcrParsePrompt(ocrText));
  return processAiBookingResponse(response);
}

export async function parseBookingMessageWithAiEx(
  text: string,
  _roster?: StaffRosterEntry[],
): Promise<AiBookingParseResult> {
  const response = await callAiParse(text);
  return processAiBookingResponse(response);
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

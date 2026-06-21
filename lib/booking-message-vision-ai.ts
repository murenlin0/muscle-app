import type { StaffUiParsedBooking } from '@/lib/booking-message';
import {
  BookingParseIncompleteError,
  isGeminiConfigured,
  isGroqConfigured,
  processAiBookingResponse,
} from '@/lib/booking-message-ai';
import { STORE_TIMEZONE } from '@/lib/store-timezone';

const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

/** Groq base64 圖片上限 4MB（見 console.groq.com/docs/vision） */
export const MAX_BOOKING_IMAGE_BYTES = 4 * 1024 * 1024;
export const BOOKING_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type BookingImageMimeType = (typeof BOOKING_IMAGE_MIME_TYPES)[number];

function readEnvKey(name: 'GROQ_API_KEY' | 'GEMINI_API_KEY'): string {
  const raw = process.env[name];
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '');
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

function buildScreenshotPrompt(): string {
  const { date, time } = taipeiNowParts();

  return `你是筋棧按摩店的預約助手。師傅上傳 LINE／聊天截圖，請讀圖並解析預約資訊。

必要欄位（四項皆須能確定才可 complete；分店與負責師傅由畫面選單指定，勿解析）：
1. 客人姓名
2. 電話（台灣手機 09 開頭 10 碼）
3. 時長（僅 30、60、90、120 分鐘）
4. 預約時間（startsAtLocal 格式 YYYY-MM-DD HH:mm，Asia/Taipei）

【時間判斷 — 非常重要】
師傅可能與客人在對話中協調、改期。請依聊天順序（上→下或左→右）找出「雙方最後確認」的時間：
- 優先：客人明確同意（好、可以、OK、沒問題、那就…）之後提到的時間
- 若有「改到」「換成」「改成」→ 用改後且被確認的時間
- 勿用第一次提議、已被否定、或僅師傅單方面提議尚未被客人確認的時間
- 若只有月日或口語時間，以今天 ${date} ${time} 為基準推斷

只回傳 JSON 物件，欄位：
status, message, storeLabel, staffName, clientName, phone, serviceLabel, durationMinutes, startsAtLocal, note, normalizedText

規則：
- 四項齊全且可確定 → status="complete"，填齊各欄位（storeLabel、staffName 一律 null），message=null
- normalizedText：用繁體中文整理成可讀文字（含姓名、電話、項目時長、最終確認時間），供後續建立預約
- 任一無法確定 → status="incomplete"，message 一句繁體中文說明缺少什麼（不超過 40 字）；勿提及師傅或店名
- 勿猜測電話或姓名；不確定就 incomplete`;
}

interface VisionAiResponse {
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
  normalizedText?: string | null;
}

export type AiScreenshotParseResult =
  | { status: 'complete'; data: StaffUiParsedBooking; normalizedText: string | null }
  | { status: 'incomplete'; message: string };

function parseVisionJson(raw: string): VisionAiResponse {
  try {
    return JSON.parse(raw) as VisionAiResponse;
  } catch {
    throw new Error('AI 回傳格式無法解析');
  }
}

async function callGroqVisionParse(
  imageBase64: string,
  mimeType: BookingImageMimeType,
): Promise<VisionAiResponse> {
  const apiKey = readEnvKey('GROQ_API_KEY');
  if (!apiKey) throw new Error('尚未設定 GROQ_API_KEY');

  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是筋棧預約截圖解析助手。只回傳 JSON 物件，不要 markdown 或其他文字。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildScreenshotPrompt() },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
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
      throw new BookingParseIncompleteError('GROQ_API_KEY 無效');
    }
    throw new Error(
      `Groq 視覺解析失敗（${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawJson = payload.choices?.[0]?.message?.content;
  if (!rawJson) throw new Error('AI 未回傳解析結果');
  return parseVisionJson(rawJson);
}

async function callGeminiVisionParse(
  imageBase64: string,
  mimeType: BookingImageMimeType,
): Promise<VisionAiResponse> {
  const apiKey = readEnvKey('GEMINI_API_KEY');
  if (!apiKey) throw new Error('尚未設定 GEMINI_API_KEY');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildScreenshotPrompt() },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
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
            normalizedText: { type: 'string', nullable: true },
          },
          required: ['status'],
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 429) {
      throw new BookingParseIncompleteError('AI 額度已用完，請稍後再試');
    }
    if (response.status === 401 || response.status === 403) {
      throw new BookingParseIncompleteError('GEMINI_API_KEY 無效');
    }
    throw new Error(
      `Gemini 視覺解析失敗（${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`,
    );
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawJson = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJson) throw new Error('AI 未回傳解析結果');
  return parseVisionJson(rawJson);
}

async function callVisionParse(
  imageBase64: string,
  mimeType: BookingImageMimeType,
): Promise<VisionAiResponse> {
  if (isGroqConfigured()) {
    return callGroqVisionParse(imageBase64, mimeType);
  }
  if (isGeminiConfigured()) {
    return callGeminiVisionParse(imageBase64, mimeType);
  }
  throw new BookingParseIncompleteError(
    '截圖解析尚未啟用，請設定 GROQ_API_KEY 或 GEMINI_API_KEY',
  );
}

export function isBookingVisionConfigured(): boolean {
  return isGroqConfigured() || isGeminiConfigured();
}

export function assertBookingVisionConfigured(): void {
  if (!isBookingVisionConfigured()) {
    throw new BookingParseIncompleteError(
      '截圖解析尚未啟用，請設定 GROQ_API_KEY 或 GEMINI_API_KEY',
    );
  }
}

export function validateBookingImage(
  bytes: Buffer,
  mimeType: string,
): mimeType is BookingImageMimeType {
  if (bytes.length === 0) return false;
  if (bytes.length > MAX_BOOKING_IMAGE_BYTES) return false;
  return (BOOKING_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export async function parseBookingScreenshotWithAiEx(
  imageBytes: Buffer,
  mimeType: BookingImageMimeType,
): Promise<AiScreenshotParseResult> {
  const imageBase64 = imageBytes.toString('base64');
  const visionResponse = await callVisionParse(imageBase64, mimeType);
  const parsed = processAiBookingResponse(visionResponse);

  if (parsed.status === 'incomplete') {
    return parsed;
  }

  return {
    status: 'complete',
    data: parsed.data,
    normalizedText: visionResponse.normalizedText?.trim() || null,
  };
}

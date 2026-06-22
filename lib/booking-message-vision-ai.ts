import {
  BookingParseIncompleteError,
  isGeminiConfigured,
  isGeminiQuotaError,
  parseBookingChatTextWithAiEx,
  processAiBookingResponse,
  throwGeminiHttpError,
  type AiBookingParseResult,
} from '@/lib/booking-message-ai';
import { tryCompleteBookingFromOcrText, tryParseBookingFromOcrTextOnly } from '@/lib/booking-ocr-hints';
import type { StaffUiParsedBooking } from '@/lib/booking-message';

/** 圖片 base64 上限 4MB */
export const MAX_BOOKING_IMAGE_BYTES = 4 * 1024 * 1024;
export const BOOKING_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type BookingImageMimeType = (typeof BOOKING_IMAGE_MIME_TYPES)[number];

export type AiScreenshotParseResult =
  | {
      status: 'complete';
      data: StaffUiParsedBooking;
      normalizedText: string | null;
      extractedText?: string;
      parseMethod?: 'ocr-text' | 'vision-json';
    }
  | { status: 'incomplete'; message: string; extractedText?: string };

const GEMINI_VISION_MODEL =
  process.env.GEMINI_VISION_MODEL ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

const OCR_SYSTEM = `你是 LINE 聊天截圖的文字轉寫助手。只輸出對話文字，不要 JSON、不要解釋。

規則：
1. 依畫面由上到下、左到右逐行轉寫
2. 每則訊息一行，格式：[發話者] 內容（右側氣泡=官方/店家，左側=客人；看不清寫「官方」或「客人」）
3. 【重要】LINE「預約確認」卡片、圖文訊息、灰色資訊列中的姓名、電話、項目、時間必須完整轉寫，格式如：
   姓名：王小明
   電話：0912345678
   項目：運動按摩 60min
   時間：2026-06-25 14:00
4. 保留所有 09 開頭電話、中文姓名、時長數字，勿改寫
5. 略過輸入框、底部選單、狀態列，但保留對話與確認卡內的時間
6. 看不清用 ? 代替，勿憑空捏造`;

const VISION_JSON_FALLBACK_PROMPT = `你是筋棧按摩店預約助手。從 LINE 聊天截圖直接判斷預約資訊。

必要：客人姓名、電話(09開頭10碼)、時長(30/60/90/120)、預約時間(YYYY-MM-DD HH:mm Asia/Taipei)。
「今天有17:00的預約」→ 日期用今天、時間17:00；改時長但時間不變時仍取原時間。
改期時取雙方最後確認的時間。分店與師傅勿解析。

只回 JSON：status, message, storeLabel, staffName, clientName, phone, serviceLabel, durationMinutes, startsAtLocal, note
complete 時 storeLabel/staffName=null；incomplete 時 message 一句繁體中文。`;

export type VisionParseResult = AiBookingParseResult & {
  extractedText?: string;
  parseMethod?: 'ocr-text' | 'vision-json';
};

function readGeminiKey(): string {
  const raw = process.env.GEMINI_API_KEY;
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

function buildNormalizedTextFromOcr(ocrText: string, data: StaffUiParsedBooking): string {
  const d = data.startsAt;
  const y = d.toLocaleString('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric' });
  const mo = d.toLocaleString('en-CA', { timeZone: 'Asia/Taipei', month: '2-digit' });
  const day = d.toLocaleString('en-CA', { timeZone: 'Asia/Taipei', day: '2-digit' });
  const h = d.toLocaleString('en-CA', { timeZone: 'Asia/Taipei', hour: '2-digit', hour12: false });
  const mi = d.toLocaleString('en-CA', { timeZone: 'Asia/Taipei', minute: '2-digit' });
  return [
    `姓名：${data.clientName}`,
    `電話：${data.phone}`,
    `項目：${data.serviceLabel}`,
    `時間：${y}-${mo}-${day} ${h}:${mi}`,
    '',
    '--- AI 讀到的對話 ---',
    ocrText,
  ].join('\n');
}

export function isBookingVisionConfigured(): boolean {
  return isGeminiConfigured();
}

export function assertBookingVisionConfigured(): void {
  if (!isBookingVisionConfigured()) {
    throw new BookingParseIncompleteError(
      '截圖解析尚未啟用，請在 Vercel 設定 GEMINI_API_KEY',
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

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return (fence ? fence[1] : trimmed).trim();
}

function normalizeOcrText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

async function callGeminiGenerate(parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>, options?: {
  json?: boolean;
  maxOutputTokens?: number;
}): Promise<string> {
  const apiKey = readGeminiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: options?.maxOutputTokens ?? 2048,
        ...(options?.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throwGeminiHttpError(res.status, errBody);
  }

  const bodyText = await res.text();
  if (!bodyText.trim()) {
    throw new BookingParseIncompleteError('AI 回傳空白，請稍後再試');
  }
  let data: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    throw new BookingParseIncompleteError('AI 回傳格式異常，請稍後再試');
  }
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!content) {
    const blocked = data.promptFeedback?.blockReason;
    throw new BookingParseIncompleteError(
      blocked ? 'AI 無法處理此截圖，請改貼文字' : 'AI 回傳空白，請稍後再試',
    );
  }
  return content;
}

async function callGeminiOcr(imageBase64: string, mimeType: string): Promise<string> {
  const content = await callGeminiGenerate([
    { text: `${OCR_SYSTEM}\n\n請轉寫此 LINE 聊天截圖中的對話：` },
    { inline_data: { mime_type: mimeType, data: imageBase64 } },
  ]);
  return normalizeOcrText(content);
}

async function extractChatTextFromImage(
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new BookingParseIncompleteError(
      '截圖 OCR 尚未啟用，請在 Vercel 設定 GEMINI_API_KEY',
    );
  }
  return callGeminiOcr(imageBase64, mimeType);
}

/** 備援：Gemini vision 直接輸出 JSON */
async function callVisionJsonFallback(
  imageBase64: string,
  mimeType: string,
): Promise<AiBookingParseResult> {
  if (!isGeminiConfigured()) {
    throw new BookingParseIncompleteError('無法解析截圖，請改貼文字或重試');
  }

  let raw: string;
  try {
    raw = await callGeminiGenerate(
      [
        { text: VISION_JSON_FALLBACK_PROMPT },
        { text: '解析此 LINE 預約對話截圖：' },
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
      ],
      { json: true, maxOutputTokens: 2048 },
    );
  } catch (e) {
    if (e instanceof BookingParseIncompleteError) throw e;
    throw new BookingParseIncompleteError('無法解析截圖，請改貼文字或重試');
  }

  const jsonText = stripCodeFence(raw);
  if (!jsonText) {
    throw new BookingParseIncompleteError('AI 回傳空白，請稍後再試');
  }

  let parsed: Parameters<typeof processAiBookingResponse>[0];
  try {
    parsed = JSON.parse(jsonText) as Parameters<typeof processAiBookingResponse>[0];
  } catch {
    throw new BookingParseIncompleteError('AI 回傳格式異常，請重試或改貼文字');
  }
  return processAiBookingResponse(parsed);
}

export async function parseBookingImageWithAiEx(
  imageBase64: string,
  mimeType: string,
): Promise<VisionParseResult> {
  let extractedText: string | undefined;

  try {
    extractedText = await extractChatTextFromImage(imageBase64, mimeType);

    if (extractedText.length < 8) {
      throw new BookingParseIncompleteError('截圖文字過少，請確認是否為 LINE 對話截圖');
    }

    const regexFirst = tryParseBookingFromOcrTextOnly(extractedText);
    if (regexFirst.status === 'complete') {
      return { ...regexFirst, extractedText, parseMethod: 'ocr-text' };
    }

    let parsed = await parseBookingChatTextWithAiEx(extractedText);
    parsed = tryCompleteBookingFromOcrText(parsed, extractedText);
    if (parsed.status === 'complete') {
      return { ...parsed, extractedText, parseMethod: 'ocr-text' };
    }

    console.warn('[vision-ai] OCR 文字解析 incomplete，嘗試 vision JSON 備援:', parsed.message);
    const fallback = await callVisionJsonFallback(imageBase64, mimeType);
    const enriched = tryCompleteBookingFromOcrText(fallback, extractedText);
    return {
      ...enriched,
      extractedText,
      parseMethod: 'vision-json',
    };
  } catch (primaryErr) {
    if (isGeminiQuotaError(primaryErr)) {
      const err = new BookingParseIncompleteError(
        primaryErr instanceof Error ? primaryErr.message : 'Gemini API 配額已用完',
      );
      if (extractedText) {
        (err as BookingParseIncompleteError & { extractedText?: string }).extractedText =
          extractedText;
      }
      throw err;
    }

    console.warn('[vision-ai] OCR+解析失敗，嘗試 vision JSON 備援:', primaryErr);

    try {
      const fallback = await callVisionJsonFallback(imageBase64, mimeType);
      const enriched = extractedText
        ? tryCompleteBookingFromOcrText(fallback, extractedText)
        : fallback;
      return {
        ...enriched,
        extractedText,
        parseMethod: 'vision-json',
      };
    } catch (fallbackErr) {
      if (primaryErr instanceof BookingParseIncompleteError) {
        const err = new BookingParseIncompleteError(primaryErr.message);
        if (extractedText) {
          (err as BookingParseIncompleteError & { extractedText?: string }).extractedText =
            extractedText;
        }
        throw err;
      }
      console.error('[vision-ai] 備援也失敗:', fallbackErr);
      throw primaryErr;
    }
  }
}

export async function parseBookingScreenshotWithAiEx(
  imageBytes: Buffer,
  mimeType: BookingImageMimeType,
): Promise<AiScreenshotParseResult> {
  const imageBase64 = imageBytes.toString('base64');
  const result = await parseBookingImageWithAiEx(imageBase64, mimeType);

  if (result.status === 'incomplete') {
    return {
      status: 'incomplete',
      message: result.message,
      extractedText: result.extractedText,
    };
  }

  const normalizedText =
    result.extractedText && result.extractedText.length > 0
      ? buildNormalizedTextFromOcr(result.extractedText, result.data)
      : null;

  return {
    status: 'complete',
    data: result.data,
    normalizedText,
    extractedText: result.extractedText,
    parseMethod: result.parseMethod,
  };
}

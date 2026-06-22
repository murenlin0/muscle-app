import {
  BookingParseIncompleteError,
  isGeminiConfigured,
  isGroqConfigured,
  parseBookingChatTextWithAiEx,
  processAiBookingResponse,
  type AiBookingParseResult,
} from '@/lib/booking-message-ai';
import type { StaffUiParsedBooking } from '@/lib/booking-message';

/** Groq base64 圖片上限 4MB（見 console.groq.com/docs/vision） */
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

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct';
const GEMINI_VISION_MODEL =
  process.env.GEMINI_VISION_MODEL ?? 'gemini-2.0-flash';

const OCR_SYSTEM = `你是 LINE 聊天截圖的文字轉寫助手。只輸出對話文字，不要 JSON、不要解釋。

規則：
1. 依畫面由上到下、左到右逐行轉寫
2. 每則訊息一行，格式：[發話者] 內容（發話者從氣泡位置判斷：右側通常是官方/店家，左側通常是客人；名稱看不清寫「客人」或「官方」）
3. 保留電話、時間、時長、姓名等數字與文字，勿改寫語意
4. 略過純 UI（輸入框、底部選單、狀態列時間），但保留對話內的時間
5. 看不清的字用 ? 代替，勿憑空捏造`;

const VISION_JSON_FALLBACK_PROMPT = `你是筋棧按摩店預約助手。從 LINE 聊天截圖直接判斷預約資訊。

必要：客人姓名、電話(09開頭10碼)、時長(30/60/90/120)、預約時間(YYYY-MM-DD HH:mm Asia/Taipei)。
改期時取雙方最後確認的時間。分店與師傅勿解析。

只回 JSON：status, message, storeLabel, staffName, clientName, phone, serviceLabel, durationMinutes, startsAtLocal, note
complete 時 storeLabel/staffName=null；incomplete 時 message 一句繁體中文。`;

export type VisionParseResult = AiBookingParseResult & {
  /** OCR 轉出的對話文字，供師傅核對 */
  extractedText?: string;
  /** 解析路徑：ocr+text 較準；vision-json 為備援 */
  parseMethod?: 'ocr-text' | 'vision-json';
};

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
  return isGroqConfigured() || isGeminiConfigured();
}

export function assertBookingVisionConfigured(): void {
  if (!isBookingVisionConfigured()) {
    throw new BookingParseIncompleteError(
      '截圖解析尚未啟用，請在 Vercel 設定 GROQ_API_KEY',
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

async function callGroqOcr(
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY 未設定');

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      temperature: 0.1,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: OCR_SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '請轉寫此 LINE 聊天截圖中的對話，每則一行 [發話者] 內容：',
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq OCR 失敗 (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Groq OCR 回傳空白');
  return normalizeOcrText(content);
}

async function callGeminiOcr(
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, '');
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${OCR_SYSTEM}\n\n請轉寫此 LINE 聊天截圖中的對話：` },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini OCR 失敗 (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!content) throw new Error('Gemini OCR 回傳空白');
  return normalizeOcrText(content);
}

async function extractChatTextFromImage(
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  // 正式環境以 Groq 為主（Llama 4 Scout vision + llama-3.3 文字解析）
  if (isGroqConfigured()) {
    try {
      return await callGroqOcr(imageBase64, mimeType);
    } catch (groqErr) {
      if (!isGeminiConfigured()) throw groqErr;
      console.warn('[vision-ai] Groq OCR 失敗，改用 Gemini:', groqErr);
    }
  }
  if (isGeminiConfigured()) {
    return callGeminiOcr(imageBase64, mimeType);
  }
  throw new BookingParseIncompleteError(
    '截圖 OCR 尚未啟用，請在 Vercel 設定 GROQ_API_KEY',
  );
}

/** 備援：vision 直接輸出 JSON（OCR+文字解析失敗時） */
async function callVisionJsonFallback(
  imageBase64: string,
  mimeType: string,
): Promise<AiBookingParseResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new BookingParseIncompleteError('無法解析截圖，請改貼文字或重試');
  }

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VISION_JSON_FALLBACK_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: '解析此 LINE 預約對話截圖：' },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq vision JSON 失敗 (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('vision JSON 回傳空白');

  const parsed = JSON.parse(stripCodeFence(raw)) as Parameters<
    typeof processAiBookingResponse
  >[0];
  return processAiBookingResponse(parsed);
}

/**
 * 兩段式：Vision OCR → 文字模型結構化（較準）；失敗時 vision JSON 備援
 */
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

    const parsed = await parseBookingChatTextWithAiEx(extractedText);
    return { ...parsed, extractedText, parseMethod: 'ocr-text' };
  } catch (primaryErr) {
    console.warn('[vision-ai] OCR+文字解析失敗，嘗試 vision JSON 備援:', primaryErr);

    try {
      const fallback = await callVisionJsonFallback(imageBase64, mimeType);
      return {
        ...fallback,
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

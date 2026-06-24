import type { StoreSlug } from '@/lib/stores';

/** 民有店（store1）為 canonical 的每日紀錄欄位 */
export const NOTION_CANONICAL_FIELDS = [
  '名稱電話',
  'Date',
  '金額數字',
  '消費類型',
  '付款方式',
  '師傅',
  '指定',
  '會員備註',
  '時數',
] as const;

export type NotionCanonicalField = (typeof NOTION_CANONICAL_FIELDS)[number];

export type NotionPropertyType =
  | 'title'
  | 'date'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'checkbox'
  | 'text';

export interface NotionFieldSchema {
  /** 該店 Notion 資料庫上的實際屬性名稱 */
  notionProperty: string;
  notionType: NotionPropertyType;
}

/**
 * 民有店 canonical 欄位 → 各店 Notion 屬性對照
 *
 * | 民有 canonical | store1 Notion | store2 Notion | type match? | notes |
 * | 名稱電話 | 名稱電話 | 名稱電話 | ✓ title | 同名 |
 * | Date | Date | Date | ✓ date | 同名 |
 * | 金額數字 | 金額數字 | 金額 | ✓ number | 文一欄位名不同 |
 * | 消費類型 | 消費類型 | 類型 | ✓ select | 文一另有 70分/100分/教練課* |
 * | 付款方式 | 付款方式 (multi_select) | 使用位置 (select) | ✗ | 值對照見 STORE2_PAYMENT_LOCATION_MAP |
 * | 師傅 | 師傅 | 師傅 | ✓ select | 選項文字不同（normalizeStaffName 處理） |
 * | 指定 | 指定 | 指定 | ✓ checkbox | 同名 |
 * | 會員備註 | 會員備註 | 備註 | ✓ text | 文一欄位名不同 |
 * | 時數 | 時數 | 時數 | ✓ number | 由標題分鐘數計算，僅一般消費／會員使用 |
 *
 * 文一店僅有、無民有對應：介紹、優惠卷/特約、上課簽到、工資結構、公式欄（10M*、六抽、餘額計算…）
 * 民有店僅有、無文一對應：付款方式選項（仁中信、街口）、會員餘額公式、150/180 分 VIP 等
 */
export const NOTION_SCHEMA_BY_STORE: Record<
  StoreSlug,
  Record<NotionCanonicalField, NotionFieldSchema>
> = {
  store1: {
    名稱電話: { notionProperty: '名稱電話', notionType: 'title' },
    Date: { notionProperty: 'Date', notionType: 'date' },
    金額數字: { notionProperty: '金額數字', notionType: 'number' },
    消費類型: { notionProperty: '消費類型', notionType: 'select' },
    付款方式: { notionProperty: '付款方式', notionType: 'multi_select' },
    師傅: { notionProperty: '師傅', notionType: 'select' },
    指定: { notionProperty: '指定', notionType: 'checkbox' },
    會員備註: { notionProperty: '會員備註', notionType: 'text' },
    時數: { notionProperty: '時數', notionType: 'number' },
  },
  store2: {
    名稱電話: { notionProperty: '名稱電話', notionType: 'title' },
    Date: { notionProperty: 'Date', notionType: 'date' },
    金額數字: { notionProperty: '金額', notionType: 'number' },
    消費類型: { notionProperty: '類型', notionType: 'select' },
    付款方式: { notionProperty: '使用位置', notionType: 'select' },
    師傅: { notionProperty: '師傅', notionType: 'select' },
    指定: { notionProperty: '指定', notionType: 'checkbox' },
    會員備註: { notionProperty: '備註', notionType: 'text' },
    時數: { notionProperty: '時數', notionType: 'number' },
  },
};

/** 各店可寫回的 Notion 欄位（新版民有店已移除「時數」，改由公式「員工工時」計算） */
export const NOTION_WRITABLE_FIELDS: Record<StoreSlug, ReadonlySet<NotionCanonicalField>> = {
  store1: new Set(
    NOTION_CANONICAL_FIELDS.filter((field) => field !== '時數'),
  ),
  store2: new Set(NOTION_CANONICAL_FIELDS),
};

export function isNotionFieldWritable(
  canonicalName: NotionCanonicalField,
  storeId: StoreSlug,
): boolean {
  return NOTION_WRITABLE_FIELDS[storeId].has(canonicalName);
}

export const STORE2_PAYMENT_LOCATION_MAP: Record<string, string[]> = {
  現金: ['現金'],
  郵局: ['富邦'],
  VIP: ['會員使用'],
  Line: ['Line'],
  教練課使用: ['教練課使用'],
};

const READ_FALLBACK_KEYS: Partial<Record<NotionCanonicalField, string[]>> = {
  名稱電話: ['Name'],
  金額數字: ['金額', '金額數字'],
  消費類型: ['消費類型', '類型'],
  付款方式: ['付款方式', '使用位置'],
  會員備註: ['會員備註', '備註'],
};

export function getNotionPropertyName(
  canonicalName: NotionCanonicalField,
  storeId: StoreSlug,
): string {
  return NOTION_SCHEMA_BY_STORE[storeId][canonicalName].notionProperty;
}

export function getNotionFieldSchema(
  canonicalName: NotionCanonicalField,
  storeId: StoreSlug,
): NotionFieldSchema {
  return NOTION_SCHEMA_BY_STORE[storeId][canonicalName];
}

/** 依 canonical 名稱讀取 page.properties 中的原始 Notion 屬性物件 */
export function getNotionProperty(
  props: Record<string, unknown>,
  canonicalName: NotionCanonicalField,
  storeId: StoreSlug,
): unknown {
  const { notionProperty } = getNotionFieldSchema(canonicalName, storeId);
  if (notionProperty in props) return props[notionProperty];

  for (const key of READ_FALLBACK_KEYS[canonicalName] ?? []) {
    if (key in props) return props[key];
  }
  return undefined;
}

export function mapStore2PaymentLocation(location: string | null): string[] {
  if (!location) return [];
  return STORE2_PAYMENT_LOCATION_MAP[location] ?? [location];
}

/** 文一店支援領現列偶爾漏填「使用位置」，標題已明示現金 */
const STORE2_SUPPORT_CASH_TITLE = /支援.*現金|現金領|支援領現|現領工資/;

export function inferStore2PaymentFromTitle(
  props: Record<string, unknown>,
  title: string,
  storeId: StoreSlug = 'store2',
): string[] {
  if (getNotionProperty(props, '付款方式', storeId) === undefined) return [];
  if (!STORE2_SUPPORT_CASH_TITLE.test(title)) return [];
  return ['現金'];
}

function selectName(prop: { select?: { name: string } | null } | undefined): string | null {
  return prop?.select?.name ?? null;
}

function multiSelectNames(prop: { multi_select?: { name: string }[] } | undefined): string[] {
  return (prop?.multi_select ?? []).map((o) => o.name);
}

/** 將各店 Notion 付款欄位正規化為民有店 canonical 的 payment_methods 陣列 */
export function resolveCanonicalPaymentMethods(
  props: Record<string, unknown>,
  storeId: StoreSlug,
  title = '',
): string[] {
  const paymentProp = getNotionProperty(props, '付款方式', storeId);
  const schema = getNotionFieldSchema('付款方式', storeId);

  if (schema.notionType === 'multi_select') {
    const multi = multiSelectNames(
      paymentProp as { multi_select?: { name: string }[] } | undefined,
    );
    if (multi.length) return multi;
    return [];
  }

  const fromLocation = mapStore2PaymentLocation(
    selectName(paymentProp as { select?: { name: string } | null } | undefined),
  );
  if (fromLocation.length) return fromLocation;
  return inferStore2PaymentFromTitle(props, title, storeId);
}

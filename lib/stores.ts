export type StoreSlug = 'store1' | 'store2';

export interface StoreConfig {
  /** URL slug，同時也是資料庫 stores.id */
  slug: StoreSlug;
  name: string;
  /** 預約訊息內店名一行，用於解析（須與 LIFF 送出格式一致） */
  messageStoreLabel: string;
  area: string;
  /** 官網「我要預約」→ 該店官方 LINE（加好友／聊天連結） */
  lineOfficialUrl: string;
  googleMapsUrl: string;
  heroImage: string;
  galleryImage: string;
  thumbnailImage: string;
  /** LIFF 預約系統是否已上線（僅影響 LINE 內開啟的 /storeN/book） */
  bookingEnabled: boolean;
  comingSoon?: boolean;
}

export const STORES: Record<StoreSlug, StoreConfig> = {
  store1: {
    slug: 'store1',
    name: '林口民有店',
    messageStoreLabel: '筋棧民有店',
    area: '新北市林口區',
    lineOfficialUrl: 'https://line.me/R/ti/p/@440fmgpo',
    googleMapsUrl: 'https://maps.google.com/?q=筋棧+林口民有',
    heroImage: '/stores/store1/hero.jpg',
    galleryImage: '/stores/store1/gallery.jpg',
    thumbnailImage: '/stores/store1/thumb.jpg',
    bookingEnabled: true,
  },
  store2: {
    slug: 'store2',
    name: '林口文一店',
    messageStoreLabel: '筋棧文一店',
    area: '新北市林口區',
    lineOfficialUrl: 'https://line.me/R/ti/p/@REPLACE_WENYI',
    googleMapsUrl: 'https://maps.google.com/?q=筋棧+林口文一',
    heroImage: '/stores/store2/hero.jpg',
    galleryImage: '/stores/store2/gallery.jpg',
    thumbnailImage: '/stores/store2/thumb.jpg',
    bookingEnabled: false,
    comingSoon: true,
  },
};

export const STORE_LIST = Object.values(STORES);

export function isStoreSlug(value: string): value is StoreSlug {
  return value in STORES;
}

export function getStore(slug: string): StoreConfig | null {
  if (!isStoreSlug(slug)) return null;
  return STORES[slug];
}

export function getStoreOrThrow(slug: string): StoreConfig {
  const store = getStore(slug);
  if (!store) throw new Error(`Unknown store: ${slug}`);
  return store;
}

/** 資料庫 stores.id（與 URL slug 相同） */
export function storeIdFromSlug(slug: StoreSlug): StoreSlug {
  return slug;
}

export function storeBookPath(slug: StoreSlug): string {
  return `/${slug}/book`;
}

/** 店內系統為全店共用；分店由預約訊息內店名判斷 */
export const STAFF_PORTAL_PATH = '/staff';

export function storeStaffPath(_slug: StoreSlug): string {
  return STAFF_PORTAL_PATH;
}

export function storeAdminPath(slug: StoreSlug): string {
  return `/manager/${slug}`;
}

export function resolveStoreSlugFromMessageLabel(label: string): StoreSlug | null {
  const trimmed = label.trim();
  for (const store of STORE_LIST) {
    if (store.messageStoreLabel === trimmed) return store.slug;
  }
  return null;
}

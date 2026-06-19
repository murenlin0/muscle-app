/**
 * 驗證 store2 canonical 欄位對照（不需 Notion API）
 * npx tsx scripts/tmp-probe-store2-schema.ts
 */
import {
  NOTION_SCHEMA_BY_STORE,
  getNotionProperty,
  resolveCanonicalPaymentMethods,
} from '../lib/notion-store-schema';
import { storeIdFromNotionDailyDbId } from '../lib/notion-api';
import { NOTION_STORE2_DAILY_DATA_SOURCE_ID } from '../lib/notion-api';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

console.log('=== NOTION_SCHEMA_BY_STORE ===');
for (const field of Object.keys(NOTION_SCHEMA_BY_STORE.store1) as (keyof typeof NOTION_SCHEMA_BY_STORE.store1)[]) {
  const s1 = NOTION_SCHEMA_BY_STORE.store1[field];
  const s2 = NOTION_SCHEMA_BY_STORE.store2[field];
  const typeMatch = s1.notionType === s2.notionType ? '✓' : '✗';
  console.log(
    `${field.padEnd(8)} | store1: ${s1.notionProperty} (${s1.notionType}) | store2: ${s2.notionProperty} (${s2.notionType}) | ${typeMatch}`,
  );
}

assert(
  storeIdFromNotionDailyDbId(NOTION_STORE2_DAILY_DATA_SOURCE_ID) === 'store2',
  'store2 db id mapping',
);

const store2Props = {
  名稱電話: { title: [{ plain_text: '王小明0912345678' }] },
  Date: { date: { start: '2026-05-01' } },
  金額: { number: 1200 },
  類型: { select: { name: '60分' } },
  使用位置: { select: { name: '郵局' } },
  師傅: { select: { name: 'N 杰恩' } },
  指定: { checkbox: false },
  備註: { rich_text: [{ plain_text: 'VIP 客' }] },
};

assert(getNotionProperty(store2Props, '金額數字', 'store2') === store2Props['金額'], 'amount alias');
assert(getNotionProperty(store2Props, '消費類型', 'store2') === store2Props['類型'], 'service type alias');
assert(
  resolveCanonicalPaymentMethods(store2Props, 'store2')?.[0] === '富邦',
  '郵局→富邦',
);

const vipProps = {
  ...store2Props,
  使用位置: { select: { name: 'VIP' } },
};
assert(
  resolveCanonicalPaymentMethods(vipProps, 'store2')?.[0] === '會員使用',
  'VIP→會員使用',
);

const supportCashProps = {
  名稱電話: { title: [{ plain_text: '支援現金領5000' }] },
  使用位置: { select: null },
};
assert(
  resolveCanonicalPaymentMethods(supportCashProps, 'store2', '支援現金領5000')?.[0] === '現金',
  '支援現金標題推斷',
);

console.log('\n✓ store2 canonical 對照探針全部通過');

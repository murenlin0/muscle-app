import { loadEnvLocal } from '../lib/load-env-local';
import { importNotionCsvFromFile } from '../lib/import-notion-server';
import { isStoreSlug, type StoreSlug } from '../lib/stores';

async function main() {
  loadEnvLocal();
  const filePath = process.argv[2];
  const storeArg = process.argv[3] ?? 'store1';

  if (!filePath) {
    console.error('用法: npm run import:notion -- "path/to/file.csv" [store1|store2]');
    process.exit(1);
  }

  if (!isStoreSlug(storeArg)) {
    console.error(`無效分店：${storeArg}（請用 store1 或 store2）`);
    process.exit(1);
  }

  const result = await importNotionCsvFromFile(filePath, storeArg as StoreSlug);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

/** 補 2025-11-19 游承蓉 使用列 Notion 付款方式 = 會員使用 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildNotionPaymentUpdate, updateNotionPageProperties } from '../lib/notion-api';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const pageId = '37e07d21-c964-8195-9cd6-da47232f42b2';
  await updateNotionPageProperties(pageId, buildNotionPaymentUpdate(['會員使用']));
  console.log('✓ Notion 付款方式已設為 會員使用 (page', pageId + ')');
}

main().catch((e) => { console.error(e); process.exit(1); });

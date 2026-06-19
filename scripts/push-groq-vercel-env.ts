/**
 * 將 .env.local 的 GROQ_API_KEY 推到 Vercel muscle-app-mivu
 * 用法：npx tsx scripts/push-groq-vercel-env.ts
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const local = parseEnvFile('.env.local');
const key = local.GROQ_API_KEY?.trim();

if (!key) {
  console.error(' .env.local 沒有 GROQ_API_KEY');
  process.exit(1);
}

if (!key.startsWith('gsk_')) {
  console.error('GROQ_API_KEY 格式應以 gsk_ 開頭');
  process.exit(1);
}

console.log(`→ GROQ_API_KEY (production + preview)，長度 ${key.length}`);

for (const target of ['production', 'preview'] as const) {
  execFileSync(
    'npx',
    ['vercel', 'env', 'add', 'GROQ_API_KEY', target, '--value', key, '--force', '--yes'],
    { stdio: 'inherit', cwd: process.cwd(), shell: true },
  );
}

console.log('完成。正在重新部署 muscle-app-mivu…');

execFileSync(
  'npx',
  ['vercel', 'deploy', '--prod', '--yes'],
  { stdio: 'inherit', cwd: process.cwd(), shell: true },
);

console.log('部署完成。請用手機再試 /staff 預覽解析。');

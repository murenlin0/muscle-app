import { normalizeNotionTitle } from '../lib/notion-title-normalize';

const cases = [
  ['貴董90分-1500、1600VIP柯豐永0926777117', '錦90分-1500、1600VIP柯豐永0926777117'],
  ['約翰60分1200王小明0912345678', '錦60分1200王小明0912345678'],
  ['仁120分3400/4000VIP吳澤彥0901193580', '仁120分+4000-3400、600VIP吳澤彥0901193580'],
  ['VIP3500/4000VIP蔡旼承0950253960', 'VIP+4000-3500、500VIP蔡旼承0950253960'],
  ['貴董90分+4000-1500、3100VIP文嘉琳0927676158', '錦90分+4000-1500、3100VIP文嘉琳0927676158'],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = normalizeNotionTitle(input);
  const ok = got === expected;
  if (!ok) failed += 1;
  console.log(ok ? '✓' : '✗', { input, expected, got });
}

process.exit(failed ? 1 : 0);

import {
  isMultiStaffCompoundTitle,
  parseMultiStaffCompoundTitle,
  splitMultiStaffTransaction,
} from '../lib/multi-staff-split';

const cases = [
  '仁、湘、杰恩+10000送500-4500、8000VIP張茜茜0916453353',
  '錦.湘.杰恩90分+10000送500-4500、6500VIP張茜茜0916453353',
  '仁錦雙打90分+10000送500-3000、9500VIP張茜茜0916453353',
  '仁湘雙打90分+4000-3000、3500VIP謝明潔0922013860',
  '仁90分1700馮+61425231005', // 應不匹配（無 VIP）
];

let ok = true;
for (const title of cases) {
  const match = isMultiStaffCompoundTitle(title);
  const parsed = parseMultiStaffCompoundTitle(title);
  console.log('\n---', title.slice(0, 50));
  console.log('match:', match, parsed?.staffNames);
  if (title.includes('馮+6142')) {
    if (match) ok = false;
    continue;
  }
  if (!match || !parsed) {
    ok = false;
    continue;
  }
  const rows = splitMultiStaffTransaction({ title, amount: 0, payment_methods: ['富邦'] });
  rows?.forEach((r) => console.log(' ', r.title, '|', r.category, r.amount));
}

if (!ok) process.exit(1);
console.log('\nall ok');

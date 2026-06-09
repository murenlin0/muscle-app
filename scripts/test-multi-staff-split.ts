import {
  parseMultiStaffCompoundTitle,
  splitMultiStaffTransaction,
} from '../lib/multi-staff-split';

const title = '仁、湘、杰恩+10000送500-4500、8000VIP張茜茜0916453353';
console.log('parsed:', parseMultiStaffCompoundTitle(title));
const p = parseMultiStaffCompoundTitle(title)!;
const usageEach = p.totalUsage / p.staffNames.length;
const n = p.staffNames.length;
console.log('balance0', p.finalBalance + usageEach * (n - 1 - 0));
const rows = splitMultiStaffTransaction({
  title,
  amount: 10000,
  payment_methods: ['富邦'],
});
for (const r of rows ?? []) {
  console.log(r.title, '|', r.category, r.amount, r.payment_methods, r.staff_name);
}

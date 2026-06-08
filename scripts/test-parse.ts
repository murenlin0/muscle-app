import { parseNotionNamePhone } from '../lib/phone';

const cases = [
  'VIP洪萱芸0965007000',
  '仁、湘、杰恩+10000送500-4500、8000VIP張茜茜0916453353',
  '仁90分儲值4000、2500VIP陳思涵0921577629',
  '仁120分3400/4000VIP吳澤彥0901193580',
  'VIP3500/4000VIP蔡旼承0950253960',
  '簡穎叡09657377582',
  '仁120分+4000-1900、2500簡永昇0905053180/VIP曾祐鈴',
  '錦60分+4000-1000、3000VIP黃淑玲/包鴻泰0973318020',
];

for (const c of cases) {
  console.log(JSON.stringify({ input: c, result: parseNotionNamePhone(c) }));
}

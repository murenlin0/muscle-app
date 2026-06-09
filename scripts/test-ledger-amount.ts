import { normalizeLedgerAmount } from '@/lib/ledger-amount';
import { splitLegacyTransferRow } from '@/lib/transfer-split';

const cases: [string, number, number][] = [
  ['支出', 500, -500],
  ['分紅', 300, -300],
  ['轉出', 500, -500],
  ['轉入', 500, 500],
  ['一般消費', 1200, 1200],
];

for (const [cat, inAmt, expected] of cases) {
  const got = normalizeLedgerAmount(cat as never, inAmt);
  if (got !== expected) {
    console.error(`FAIL ${cat} ${inAmt} => ${got}, want ${expected}`);
    process.exit(1);
  }
}

const split = splitLegacyTransferRow({
  store_id: 'store1',
  occurred_on: '2026-01-01',
  title: '現金移500到富邦',
  amount: 500,
  category: '轉移',
  payment_methods: [],
});

if (!split || split.rows.length !== 2) {
  console.error('FAIL transfer split');
  process.exit(1);
}

console.log('OK', split.rows.map((r) => `${r.category} ${r.amount} ${r.payment_methods}`));

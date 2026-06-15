/**
 * 會員相關格式問題總覽
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { isMultiStaffCompoundTitle } from '../lib/multi-staff-split';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const all: {
    occurred_on: string;
    title: string;
    amount: number;
    category: string;
    payment_methods: string[];
  }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on, title, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  const issues = {
    compoundUnsplit: [] as string[],
    doublePlay: [] as string[],
    memberUseWithAccount: [] as string[],
    memberTopupNoAccount: [] as string[],
    memberUseWithPlusTitle: 0,
    titleDupMember: 0,
    legacyTransfer: 0,
  };

  const td = new Map<string, number>();
  for (const r of all) {
    const t = r.title.replace(/\s/g, '');

    if (isMultiStaffCompoundTitle(r.title)) {
      issues.compoundUnsplit.push(`${r.occurred_on} ${r.category} $${r.amount} ${r.title.slice(0, 55)}`);
    }

    if (/雙打/.test(t) && /\+?\d{4,}/.test(t)) {
      issues.doublePlay.push(`${r.occurred_on} ${r.category} $${r.amount} ${r.title.slice(0, 55)}`);
    }

    if (r.category === '會員使用' && (r.payment_methods?.length ?? 0) > 0) {
      issues.memberUseWithAccount.push(
        `${r.occurred_on} [${r.payment_methods.join(',')}] $${r.amount} ${r.title.slice(0, 45)}`,
      );
    }

    if (r.category === '會員儲值' && !(r.payment_methods?.length ?? 0)) {
      issues.memberTopupNoAccount.push(`${r.occurred_on} $${r.amount} ${r.title.slice(0, 50)}`);
    }

    if (r.category === '會員使用' && /\+\d{4,}/.test(t)) issues.memberUseWithPlusTitle++;

    if (['會員使用', '會員儲值', '會員補差額'].includes(r.category)) {
      const k = `${r.occurred_on}|${t}`;
      td.set(k, (td.get(k) ?? 0) + 1);
    }

    if (r.category === '轉移') issues.legacyTransfer++;
  }

  issues.titleDupMember = [...td.values()].filter((c) => c > 1).length;

  console.log('=== 會員格式問題摘要 ===\n');
  console.log(`1. 多人合寫未拆分: ${issues.compoundUnsplit.length} 列`);
  for (const s of [...new Set(issues.compoundUnsplit)].slice(0, 6)) console.log(`   · ${s}`);

  console.log(`\n2. 「雙打」合寫未支援拆分: ${issues.doublePlay.length} 列`);
  for (const s of [...new Set(issues.doublePlay)].slice(0, 8)) console.log(`   · ${s}`);

  console.log(`\n3. 會員使用卻帶帳戶標籤: ${issues.memberUseWithAccount.length} 列 (早期匯入)`);
  for (const s of issues.memberUseWithAccount.slice(0, 5)) console.log(`   · ${s}`);

  console.log(`\n4. 會員儲值無帳戶: ${issues.memberTopupNoAccount.length} 列`);
  for (const s of issues.memberTopupNoAccount.slice(0, 3)) console.log(`   · ${s}`);

  console.log(`\n5. 標題像儲值(+4000等)但類型是會員使用: ${issues.memberUseWithPlusTitle} 筆`);
  console.log(`6. 同日同標題會員重複群: ${issues.titleDupMember} 組`);
  console.log(`7. 舊類型「轉移」: ${issues.legacyTransfer} 筆`);

  // 最新日期
  const dates = all.map((r) => r.occurred_on).sort();
  console.log(`\n資料範圍: ${dates[0]} ~ ${dates[dates.length - 1]}, 共 ${all.length} 列`);
}

main().catch(console.error);

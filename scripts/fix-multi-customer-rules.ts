/**
 * A 類多人合寫 → 依使用者規則正規化標題（與 client 欄位）
 * npx tsx scripts/fix-multi-customer-rules.ts [--apply]
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

type Patch = {
  id: string;
  date: string;
  oldTitle: string;
  newTitle: string;
  client_name: string | null;
  client_phone: string | null;
  rule: string;
};

function transformTitle(title: string): { title: string; rule: string; client_name: string | null; client_phone: string | null } | null {
  let t = title;
  let rule = '';
  let client_name: string | null = null;
  let client_phone: string | null = null;

  // 1. 簡永昇 → 併入 VIP曾祐鈴0937016728
  if (/VIP曾祐鈴|\/VIP曾祐鈴/.test(t) && /簡永昇/.test(t)) {
    const before = t;
    t = t
      .replace(/簡永昇0905053180\/VIP曾祐鈴0937016728/g, '簡永昇/VIP曾祐鈴0937016728')
      .replace(/簡永昇0905053180\/VIP曾祐鈴/g, '簡永昇/VIP曾祐鈴0937016728')
      .replace(/VIP曾祐鈴0937016728[（(]簡永昇\s*0905053180使用[）)]/g, '簡永昇/VIP曾祐鈴0937016728')
      .replace(/VIP曾祐鈴\/簡永昇0905053180使用/g, '簡永昇/VIP曾祐鈴0937016728');
    if (/VIP曾祐鈴(?!0937016728)/.test(t)) {
      t = t.replace(/VIP曾祐鈴(?!0937016728)/g, 'VIP曾祐鈴0937016728');
    }
    if (t !== before) {
      rule = '簡永昇→曾祐鈴0937016728';
      client_name = '曾祐鈴';
      client_phone = '0937016728';
    }
  }

  // 2. 許芳榮老婆 → 歐珮芠/VIP許芳榮0916962345（排除「許芳榮老婆兒子」）
  if (/許芳榮老婆/.test(t) && !/許芳榮老婆兒/.test(t)) {
    const before = t;
    t = t
      .replace(/許芳榮老婆\/VIP許芳榮/g, '歐珮芠/VIP許芳榮0916962345')
      .replace(/VIP許芳榮老婆/g, '歐珮芠/VIP許芳榮0916962345')
      .replace(/(?<![\/])許芳榮老婆(?![\/])/g, '歐珮芠/VIP許芳榮0916962345');
    if (t !== before) {
      rule = rule || '許芳榮老婆→歐珮芠/VIP許芳榮0916962345';
      client_name = client_name ?? '許芳榮';
      client_phone = client_phone ?? '0916962345';
    }
  }

  // 3. VIP蔡承霖 / VIP葉怡汝 → 葉怡汝/VIP蔡承霖0928506938
  if (/VIP蔡承霖\/VIP葉怡汝|VIP蔡承霖\/葉怡汝|蔡承霖\/葉怡汝0978750925/.test(t)) {
    const before = t;
    t = t
      .replace(/VIP蔡承霖\/VIP葉怡汝0978750925/g, '葉怡汝/VIP蔡承霖0928506938')
      .replace(/VIP蔡承霖\/VIP葉怡汝/g, '葉怡汝/VIP蔡承霖0928506938')
      .replace(/VIP蔡承霖\/葉怡汝0978750925/g, '葉怡汝/VIP蔡承霖0928506938')
      .replace(/蔡承霖\/葉怡汝0978750925/g, '葉怡汝/VIP蔡承霖0928506938');
    if (t !== before) {
      rule = rule || '蔡承霖/葉怡汝→葉怡汝/VIP蔡承霖0928506938';
      client_name = '蔡承霖';
      client_phone = '0928506938';
    }
  }

  // 4. 歐珮芠0937932717/VIP許芳榮 → 歐珮芠/VIP許芳榮0916962345
  if (/歐珮芠0937932717/.test(t) && /VIP許芳榮/.test(t)) {
    const before = t;
    t = t.replace(/歐珮芠0937932717\/VIP許芳榮/g, '歐珮芠/VIP許芳榮0916962345');
    if (/VIP許芳榮(?!0916962345)/.test(t)) {
      t = t.replace(/VIP許芳榮(?!0916962345)/g, 'VIP許芳榮0916962345');
    }
    if (t !== before) {
      rule = rule || '歐珮芠→VIP許芳榮0916962345';
      client_name = client_name ?? '許芳榮';
      client_phone = client_phone ?? '0916962345';
    }
  }

  // 5. 雪莉/馬拉松 → VIP馬拉松雪莉0932127973
  if (/VIP雪莉0932127973\/馬拉松|雪莉0932127973\/馬拉松/.test(t)) {
    const before = t;
    t = t
      .replace(/VIP雪莉0932127973\/馬拉松/g, 'VIP馬拉松雪莉0932127973')
      .replace(/雪莉0932127973\/馬拉松/g, 'VIP馬拉松雪莉0932127973');
    if (t !== before) {
      rule = rule || '雪莉/馬拉松→VIP馬拉松雪莉0932127973';
      client_name = '馬拉松雪莉';
      client_phone = '0932127973';
    }
  }

  // 6. 吳季桓/跑團 → VIP跑團吳季桓0988703860
  if (/VIP吳季桓0988703860\/跑團/.test(t)) {
    const before = t;
    t = t.replace(/VIP吳季桓0988703860\/跑團/g, 'VIP跑團吳季桓0988703860');
    if (t !== before) {
      rule = rule || '吳季桓/跑團→VIP跑團吳季桓0988703860';
      client_name = '跑團吳季桓';
      client_phone = '0988703860';
    }
  }

  // 7. 廖家昱/馬拉松 → 馬拉松廖家昱0988762035
  if (/廖家昱0988762035\/馬拉松/.test(t)) {
    const before = t;
    t = t.replace(/廖家昱0988762035\/馬拉松/g, '馬拉松廖家昱0988762035');
    if (t !== before) {
      rule = rule || '廖家昱/馬拉松→馬拉松廖家昱0988762035';
      client_name = '馬拉松廖家昱';
      client_phone = '0988762035';
    }
  }

  // 8. 黃若瑜/VIPJames Gea → 加 (無電話)
  if (/黃若瑜\/VIPJames Gea/.test(t) && !/\(無電話\)|（無電話）/.test(t)) {
    const before = t;
    t = t.replace(/黃若瑜\/VIPJames Gea/g, '黃若瑜/VIPJames Gea(無電話)');
    if (t !== before) {
      rule = rule || '黃若瑜/James Gea→(無電話)';
      client_name = 'James Gea';
      client_phone = null;
    }
  }

  // 9. 張德銘0968095693/VIP徐韶蓓 → 張德銘/VIP徐韶蓓0926095059
  if (/張德銘0968095693\/VIP徐韶蓓/.test(t)) {
    const before = t;
    t = t.replace(/張德銘0968095693\/VIP徐韶蓓/g, '張德銘/VIP徐韶蓓0926095059');
    if (t !== before) {
      rule = rule || '張德銘→VIP徐韶蓓0926095059';
      client_name = '徐韶蓓';
      client_phone = '0926095059';
    }
  }

  // 10. 陳佳翎0919805192/VIP張以蔚 → 陳佳翎/VIP張以蔚0930727242
  if (/陳佳翎0919805192\/VIP張以蔚/.test(t)) {
    const before = t;
    t = t.replace(/陳佳翎0919805192\/VIP張以蔚/g, '陳佳翎/VIP張以蔚0930727242');
    if (t !== before) {
      rule = rule || '陳佳翎→VIP張以蔚0930727242';
      client_name = '張以蔚';
      client_phone = '0930727242';
    }
  }

  // 11. VIP黃淑玲/包鴻泰0973318020 → 黃淑玲/VIP包鴻泰0973318020
  if (/VIP黃淑玲\/包鴻泰0973318020/.test(t)) {
    const before = t;
    t = t.replace(/VIP黃淑玲\/包鴻泰0973318020/g, '黃淑玲/VIP包鴻泰0973318020');
    if (t !== before) {
      rule = rule || 'VIP黃淑玲→黃淑玲/VIP包鴻泰0973318020';
      client_name = '包鴻泰';
      client_phone = '0973318020';
    }
  }

  // 12. VIP翁先生Richard Weng → 加 (無電話)
  if (/VIP翁先生Richard\s*Weng/.test(t) && !/\(無電話\)|（無電話）/.test(t)) {
    const before = t;
    t = t.replace(/VIP翁先生Richard\s*Weng/g, 'VIP翁先生Richard Weng(無電話)');
    if (t !== before) {
      rule = rule || '翁先生Richard Weng→(無電話)';
      client_name = '翁先生Richard Weng';
      client_phone = null;
    }
  }

  // 13. VIPJiayu佳妤 → VIP抱石教練Jiayu佳妤（無電話）
  if (/VIP\s*Jiayu佳妤/.test(t) && !/抱石教練|（無電話）|\(無電話\)/.test(t)) {
    const before = t;
    t = t.replace(/VIP\s*Jiayu佳妤/g, 'VIP抱石教練Jiayu佳妤（無電話）');
    if (t !== before) {
      rule = rule || 'Jiayu佳妤→抱石教練（無電話）';
      client_name = '抱石教練Jiayu佳妤';
      client_phone = null;
    }
  }

  if (t === title || !rule) return null;
  return { title: t, rule, client_name, client_phone };
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  const rows: {
    id: string;
    occurred_on: string;
    title: string;
    client_name: string | null;
    client_phone: string | null;
  }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, client_name, client_phone')
      .eq('store_id', 'store1')
      .order('occurred_on')
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  const patches: Patch[] = [];
  for (const row of rows) {
    const result = transformTitle(row.title);
    if (!result) continue;
    patches.push({
      id: row.id,
      date: row.occurred_on,
      oldTitle: row.title,
      newTitle: result.title,
      client_name: result.client_name,
      client_phone: result.client_phone,
      rule: result.rule,
    });
  }

  const lines = patches.map(
    (p) =>
      `[${p.rule}] ${p.date}\n  舊: ${p.oldTitle}\n  新: ${p.newTitle}\n  客人: ${p.client_name} ${p.client_phone}\n`,
  );
  writeFileSync('fix-multi-customer-rules-report.txt', `共 ${patches.length} 筆\n\n${lines.join('\n')}`, 'utf8');

  const byRule = new Map<string, number>();
  for (const p of patches) byRule.set(p.rule, (byRule.get(p.rule) ?? 0) + 1);

  console.log(`需更新 ${patches.length} 筆`);
  for (const [r, n] of byRule) console.log(`  ${r}: ${n}`);
  for (const p of patches.slice(0, 20)) {
    console.log(`\n[${p.rule}] ${p.date}`);
    console.log(`  舊: ${p.oldTitle}`);
    console.log(`  新: ${p.newTitle}`);
  }
  if (patches.length > 20) console.log(`\n...其餘見 fix-multi-customer-rules-report.txt`);

  if (!apply) {
    console.log('\n(dry-run，加 --apply 寫回)');
    return;
  }

  let done = 0;
  for (const p of patches) {
    const { error } = await sb
      .from('daily_transactions')
      .update({
        title: p.newTitle,
        client_name: p.client_name,
        client_phone: p.client_phone,
      })
      .eq('id', p.id);
    if (error) console.error(p.id, error.message);
    else done += 1;
  }
  console.log(`\nupdated ${done}/${patches.length}`);
}

main().catch(console.error);

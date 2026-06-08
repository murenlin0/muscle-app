import { readFileSync } from 'fs';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { StoreSlug } from '@/lib/stores';
import { computeClientsFromNotionCsv } from '@/lib/notion-import';

export interface ImportNotionResult {
  filename: string;
  rowsTotal: number;
  skippedRows: number;
  clientsUpserted: number;
  sample: { phone: string; name: string; initial_balance: number }[];
}

export async function importNotionCsvFromText(
  csvText: string,
  filename: string,
  storeSlug: StoreSlug = 'store1',
): Promise<ImportNotionResult> {
  const supabase = getSupabaseAdmin();
  const { clients, skipped, totalRows } = computeClientsFromNotionCsv(csvText);

  let upserted = 0;

  for (const c of clients) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id, line_user_id')
      .eq('store_id', storeSlug)
      .eq('phone', c.phone)
      .maybeSingle();

    const payload = {
      store_id: storeSlug,
      phone: c.phone,
      name: c.name,
      is_vip: c.is_vip,
      initial_balance: c.initial_balance,
      balance: c.initial_balance,
      is_active: true,
      ...(existing?.line_user_id ? { line_user_id: existing.line_user_id } : {}),
    };

    const { error } = existing
      ? await supabase.from('clients').update(payload).eq('id', existing.id)
      : await supabase.from('clients').insert(payload);

    if (error) throw new Error(`匯入 ${c.phone} 失敗：${error.message}`);
    upserted += 1;
  }

  await supabase.from('import_batches').insert({
    store_id: storeSlug,
    filename,
    rows_total: totalRows,
    clients_upserted: upserted,
    skipped_rows: skipped,
    note: 'Notion CSV 期初餘額',
  });

  return {
    filename,
    rowsTotal: totalRows,
    skippedRows: skipped,
    clientsUpserted: upserted,
    sample: clients.slice(0, 5).map((c) => ({
      phone: c.phone,
      name: c.name,
      initial_balance: c.initial_balance,
    })),
  };
}

export async function importNotionCsvFromFile(
  filePath: string,
  storeSlug: StoreSlug = 'store1',
): Promise<ImportNotionResult> {
  const csvText = readFileSync(filePath, 'utf8');
  const filename = filePath.split(/[/\\]/).pop() ?? filePath;
  return importNotionCsvFromText(csvText, filename, storeSlug);
}

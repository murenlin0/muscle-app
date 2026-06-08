import { parse } from 'csv-parse/sync';
import { parseNotionNamePhone } from '@/lib/phone';

export interface NotionCsvRow {
  名稱電話: string;
  Date: string;
  付款方式: string;
  師傅: string;
  會員餘額: string;
  消費類型: string;
  金額數字: string;
}

export interface NotionImportClient {
  phone: string;
  name: string;
  is_vip: boolean;
  initial_balance: number;
  last_activity_at: string;
}

interface BalanceEvent {
  date: Date;
  delta: number;
}

function parseNotionDate(raw: string): Date {
  const trimmed = raw.trim();
  const datePart = trimmed.split(/\s+/)[0] ?? trimmed;
  const normalized = datePart.replace(/\//g, '-');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function parseAmount(raw: string): number {
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * 從 Notion 每日紀錄 CSV 推算每位客人期初餘額。
 * 邏輯：依時間序累計 儲值(+金額) 與 會員使用(-金額)；現金單次不影響餘額。
 */
export function computeClientsFromNotionCsv(csvText: string): {
  clients: NotionImportClient[];
  skipped: number;
  totalRows: number;
} {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as NotionCsvRow[];

  const eventsByPhone = new Map<
    string,
    { name: string; is_vip: boolean; events: BalanceEvent[] }
  >();
  let skipped = 0;

  for (const row of rows) {
    const parsed = parseNotionNamePhone(row['名稱電話'] ?? '');
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const type = (row['消費類型'] ?? '').trim();
    if (type === '支出') {
      skipped += 1;
      continue;
    }

    const amount = parseAmount(row['金額數字']);
    const date = parseNotionDate(row['Date'] ?? '');
    let delta = 0;

    if (type === '儲值') {
      delta = amount > 0 ? amount : 0;
    } else if (type.includes('會員') || row['付款方式'] === '會員使用') {
      delta = amount > 0 ? -amount : 0;
    } else {
      skipped += 1;
      continue;
    }

    if (delta === 0) {
      skipped += 1;
      continue;
    }

    const bucket = eventsByPhone.get(parsed.phone) ?? {
      name: parsed.name,
      is_vip: false,
      events: [],
    };
    bucket.name = parsed.name;
    bucket.is_vip = bucket.is_vip || Boolean(parsed.isVip);
    bucket.events.push({ date, delta });
    eventsByPhone.set(parsed.phone, bucket);
  }

  const clients: NotionImportClient[] = [];

  for (const [phone, { name, is_vip, events }] of eventsByPhone) {
    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    let balance = 0;
    let lastDate = new Date(0);

    for (const e of events) {
      balance += e.delta;
      if (e.date > lastDate) lastDate = e.date;
    }

    if (balance < 0) balance = 0;

    clients.push({
      phone,
      name,
      is_vip,
      initial_balance: balance,
      last_activity_at: lastDate.toISOString(),
    });
  }

  clients.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

  return { clients, skipped, totalRows: rows.length };
}

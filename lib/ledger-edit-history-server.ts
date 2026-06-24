import {
  createDailyTransaction,
  deleteDailyTransaction,
  normalizeTransactionInput,
  updateDailyTransaction,
  type TransactionInput,
} from '@/lib/daily-transactions-server';
import type { PortalSession } from '@/lib/portal-session';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { StoreSlug } from '@/lib/stores';
import type { TransactionCategory } from '@/lib/transaction-category';

import type { LedgerEditAction } from '@/lib/ledger-edit-history-types';

export interface TransactionSnapshot {
  id: string;
  occurredOn: string;
  title: string;
  amount: number;
  category: TransactionCategory;
  paymentMethods: string[];
  staffName: string | null;
  clientName: string | null;
  clientPhone: string | null;
}

export interface LedgerEditRecord {
  id: string;
  storeId: StoreSlug;
  transactionId: string | null;
  action: LedgerEditAction;
  summary: string;
  actorName: string;
  actorRole: string;
  createdAt: string;
  undoneAt: string | null;
  before: TransactionSnapshot | null;
  after: TransactionSnapshot | null;
}

export interface EditActor {
  name: string;
  role: string;
}

export class LedgerEditTableMissingError extends Error {
  constructor() {
    super(
      '編輯紀錄資料表尚未建立。請至 Supabase → SQL Editor 執行 supabase/18_ledger_edit_history.sql（或 reconcile.sql 區段 J）',
    );
    this.name = 'LedgerEditTableMissingError';
  }
}

export function isEditTableMissingError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  return (
    code === 'PGRST205' ||
    msg.includes('daily_transaction_edits') ||
    msg.includes('schema cache')
  );
}

function rethrowUnlessMissingTable(error: unknown): void {
  if (isEditTableMissingError(error)) {
    throw new LedgerEditTableMissingError();
  }
}

export function actorFromSession(session: PortalSession): EditActor {
  if (session.role === 'super') {
    return { name: session.displayName, role: 'super' };
  }
  if (session.role === 'store') {
    return { name: session.displayName, role: 'store' };
  }
  return { name: session.staffName, role: 'staff' };
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function fmtAmount(amount: number): string {
  return Math.abs(Math.round(amount)).toLocaleString('zh-TW');
}

export function summarizeLedgerEdit(
  action: Exclude<LedgerEditAction, 'undo'>,
  before: TransactionSnapshot | null,
  after: TransactionSnapshot | null,
): string {
  if (action === 'create' && after) {
    return `新增「${truncate(after.title, 28)}」· ${after.category} · $${fmtAmount(after.amount)}`;
  }
  if (action === 'delete' && before) {
    return `刪除「${truncate(before.title, 28)}」· ${before.category}`;
  }
  if (action === 'update' && before && after) {
    const changes: string[] = [];
    if (before.occurredOn !== after.occurredOn) changes.push('日期');
    if (before.title !== after.title) changes.push('標題');
    if (before.amount !== after.amount) changes.push('金額');
    if (before.category !== after.category) changes.push('類型');
    if (JSON.stringify(before.paymentMethods) !== JSON.stringify(after.paymentMethods)) {
      changes.push('帳戶');
    }
    if (before.staffName !== after.staffName) changes.push('人員');
    if (before.clientName !== after.clientName || before.clientPhone !== after.clientPhone) {
      changes.push('客人');
    }
    const label = changes.length ? changes.join('、') : '內容';
    return `修改「${truncate(after.title, 24)}」· ${label}`;
  }
  return '流水帳異動';
}

function mapSnapshot(row: {
  id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  payment_methods: string[] | null;
  staff_name: string | null;
  client_name: string | null;
  client_phone: string | null;
}): TransactionSnapshot {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    title: row.title,
    amount: row.amount,
    category: row.category as TransactionCategory,
    paymentMethods: row.payment_methods ?? [],
    staffName: row.staff_name,
    clientName: row.client_name,
    clientPhone: row.client_phone,
  };
}

function mapEditRow(row: {
  id: string;
  store_id: string;
  transaction_id: string | null;
  action: string;
  summary: string;
  actor_name: string;
  actor_role: string;
  created_at: string;
  undone_at: string | null;
  before_data: TransactionSnapshot | null;
  after_data: TransactionSnapshot | null;
}): LedgerEditRecord {
  return {
    id: row.id,
    storeId: row.store_id as StoreSlug,
    transactionId: row.transaction_id,
    action: row.action as LedgerEditAction,
    summary: row.summary,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    createdAt: row.created_at,
    undoneAt: row.undone_at,
    before: row.before_data,
    after: row.after_data,
  };
}

export async function fetchTransactionSnapshot(
  id: string,
  storeId: StoreSlug,
): Promise<TransactionSnapshot | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('daily_transactions')
    .select(
      'id, occurred_on, title, amount, category, payment_methods, staff_name, client_name, client_phone',
    )
    .eq('id', id)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSnapshot(data) : null;
}

async function insertEditLog(input: {
  storeId: StoreSlug;
  transactionId: string | null;
  action: LedgerEditAction;
  summary: string;
  actor: EditActor;
  before: TransactionSnapshot | null;
  after: TransactionSnapshot | null;
}): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('daily_transaction_edits')
    .insert({
      store_id: input.storeId,
      transaction_id: input.transactionId,
      action: input.action,
      before_data: input.before,
      after_data: input.after,
      summary: input.summary,
      actor_name: input.actor.name,
      actor_role: input.actor.role,
    })
    .select('id')
    .single();
  if (error) {
    if (isEditTableMissingError(error)) throw new LedgerEditTableMissingError();
    throw new Error(error.message);
  }
  return data.id as string;
}

export async function logTransactionCreate(
  storeId: StoreSlug,
  snapshot: TransactionSnapshot,
  actor: EditActor,
): Promise<string> {
  return insertEditLog({
    storeId,
    transactionId: snapshot.id,
    action: 'create',
    summary: summarizeLedgerEdit('create', null, snapshot),
    actor,
    before: null,
    after: snapshot,
  });
}

export async function logTransactionUpdate(
  storeId: StoreSlug,
  before: TransactionSnapshot,
  after: TransactionSnapshot,
  actor: EditActor,
): Promise<string> {
  return insertEditLog({
    storeId,
    transactionId: after.id,
    action: 'update',
    summary: summarizeLedgerEdit('update', before, after),
    actor,
    before,
    after,
  });
}

export async function logTransactionDelete(
  storeId: StoreSlug,
  before: TransactionSnapshot,
  actor: EditActor,
): Promise<string> {
  return insertEditLog({
    storeId,
    transactionId: before.id,
    action: 'delete',
    summary: summarizeLedgerEdit('delete', before, null),
    actor,
    before,
    after: null,
  });
}

export async function isLedgerEditTableReady(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('daily_transaction_edits').select('id').limit(1);
  if (!error) return true;
  return !isEditTableMissingError(error);
}

export async function listLedgerEdits(
  storeId: StoreSlug,
  limit = 80,
): Promise<LedgerEditRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('daily_transaction_edits')
    .select(
      'id, store_id, transaction_id, action, summary, actor_name, actor_role, created_at, undone_at, before_data, after_data',
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isEditTableMissingError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(mapEditRow);
}

function snapshotToInput(snapshot: TransactionSnapshot): TransactionInput {
  return {
    occurredOn: snapshot.occurredOn,
    title: snapshot.title,
    amount: snapshot.amount,
    category: snapshot.category,
    paymentMethods: snapshot.paymentMethods,
    staffName: snapshot.staffName,
    clientName: snapshot.clientName,
    clientPhone: snapshot.clientPhone,
  };
}

async function restoreDeletedTransaction(
  storeId: StoreSlug,
  snapshot: TransactionSnapshot,
): Promise<void> {
  const normalized = normalizeTransactionInput(snapshotToInput(snapshot));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('daily_transactions').insert({
    id: snapshot.id,
    store_id: storeId,
    occurred_on: normalized.occurredOn,
    title: normalized.title,
    amount: normalized.amount,
    category: normalized.category,
    payment_methods: normalized.paymentMethods,
    staff_name: normalized.staffName ?? null,
    client_name: normalized.clientName ?? null,
    client_phone: normalized.clientPhone ?? null,
    source: 'manual',
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

async function applyUndoForEdit(
  edit: LedgerEditRecord,
  storeId: StoreSlug,
): Promise<void> {
  if (edit.action === 'create') {
    if (!edit.after) throw new Error('缺少新增紀錄，無法復原');
    await deleteDailyTransaction(edit.after.id, storeId);
    return;
  }
  if (edit.action === 'delete') {
    if (!edit.before) throw new Error('缺少刪除前資料，無法復原');
    await restoreDeletedTransaction(storeId, edit.before);
    return;
  }
  if (edit.action === 'update') {
    if (!edit.before) throw new Error('缺少修改前資料，無法復原');
    await updateDailyTransaction(edit.before.id, storeId, snapshotToInput(edit.before));
    return;
  }
  throw new Error('此紀錄無法復原');
}

export async function undoLatestLedgerEdit(
  storeId: StoreSlug,
  actor: EditActor,
): Promise<{ edit: LedgerEditRecord; undoLogId: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('daily_transaction_edits')
    .select(
      'id, store_id, transaction_id, action, summary, actor_name, actor_role, created_at, undone_at, before_data, after_data',
    )
    .eq('store_id', storeId)
    .is('undone_at', null)
    .in('action', ['create', 'update', 'delete'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    rethrowUnlessMissingTable(error);
    throw new Error(error.message);
  }
  if (!data) throw new Error('沒有可復原的編輯');

  const edit = mapEditRow(data);
  await applyUndoForEdit(edit, storeId);

  const undoneAt = new Date().toISOString();
  const { error: markErr } = await supabase
    .from('daily_transaction_edits')
    .update({ undone_at: undoneAt })
    .eq('id', edit.id);
  if (markErr) throw new Error(markErr.message);

  const undoLogId = await insertEditLog({
    storeId,
    transactionId: edit.transactionId,
    action: 'undo',
    summary: `復原：${edit.summary}`,
    actor,
    before: edit.after,
    after: edit.before,
  });

  return {
    edit: { ...edit, undoneAt },
    undoLogId,
  };
}

export async function createDailyTransactionWithLog(
  storeId: StoreSlug,
  input: TransactionInput,
  actor: EditActor,
): Promise<{ id: string; editId: string }> {
  const id = await createDailyTransaction(storeId, input);
  try {
    const snapshot = await fetchTransactionSnapshot(id, storeId);
    if (!snapshot) throw new Error('新增後無法讀取紀錄');
    const editId = await logTransactionCreate(storeId, snapshot, actor);
    return { id, editId };
  } catch (e) {
    if (isEditTableMissingError(e)) return { id, editId: '' };
    throw e;
  }
}

export async function updateDailyTransactionWithLog(
  id: string,
  storeId: StoreSlug,
  input: Partial<TransactionInput>,
  actor: EditActor,
): Promise<{ editId: string }> {
  const before = await fetchTransactionSnapshot(id, storeId);
  if (!before) throw new Error('找不到要修改的列');
  await updateDailyTransaction(id, storeId, input);
  try {
    const after = await fetchTransactionSnapshot(id, storeId);
    if (!after) throw new Error('修改後無法讀取紀錄');
    const editId = await logTransactionUpdate(storeId, before, after, actor);
    return { editId };
  } catch (e) {
    if (isEditTableMissingError(e)) return { editId: '' };
    throw e;
  }
}

export async function deleteDailyTransactionWithLog(
  id: string,
  storeId: StoreSlug,
  actor: EditActor,
): Promise<{ editId: string }> {
  const before = await fetchTransactionSnapshot(id, storeId);
  if (!before) throw new Error('找不到要刪除的列');
  await deleteDailyTransaction(id, storeId);
  try {
    const editId = await logTransactionDelete(storeId, before, actor);
    return { editId };
  } catch (e) {
    if (isEditTableMissingError(e)) return { editId: '' };
    throw e;
  }
}

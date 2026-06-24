export type LedgerEditAction = 'create' | 'update' | 'delete' | 'undo';

export interface LedgerEditHistoryItem {
  id: string;
  action: LedgerEditAction;
  summary: string;
  details: string[];
  actorName: string;
  createdAt: string;
  undoneAt: string | null;
}

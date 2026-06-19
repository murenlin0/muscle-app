'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Contact, ExternalLink, LogOut } from 'lucide-react';
import Link from 'next/link';
import { PortalShell } from '@/app/components/portal-shell';
import {
  BookingPreviewPanel,
  type BookingPreviewData,
} from '@/components/portal/booking-preview-panel';
import { StatusBanner } from '@/components/portal/status-banner';
import { WorkflowSteps, type WorkflowStepId } from '@/components/portal/workflow-steps';
import { portalLogout, usePortalGuard } from '@/components/portal/use-portal-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UNASSIGNED_STAFF_LABEL } from '@/lib/booking-message';
import { STORES } from '@/lib/stores';
import type { Staff } from '@/lib/types/database';

const STAFF_API = '/api/staff';

export default function StaffWorkspacePage() {
  const router = useRouter();
  const { session, loading: bootstrapping } = usePortalGuard('staff');
  const [text, setText] = useState('');
  const [assignedStaff, setAssignedStaff] = useState(UNASSIGNED_STAFF_LABEL);
  const [staffNote, setStaffNote] = useState('');
  const [roster, setRoster] = useState<Staff[]>([]);
  const [preview, setPreview] = useState<BookingPreviewData | null>(null);
  const [parsedBy, setParsedBy] = useState<'rules' | 'ai' | null>(null);
  const [loading, setLoading] = useState<'parse' | 'create' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [calendarLink, setCalendarLink] = useState<string | null>(null);

  const staffName = session?.role === 'staff' ? session.staffName : '';

  useEffect(() => {
    void fetch(`${STAFF_API}/roster`)
      .then((res) => res.json())
      .then((data: { staff?: Staff[] }) => setRoster(data.staff ?? []))
      .catch(() => undefined);
  }, []);

  const workflowStep = useMemo((): WorkflowStepId => {
    if (success) return 'done';
    if (preview) return 'preview';
    return 'paste';
  }, [success, preview]);

  const requestBody = () => ({
    text,
    staffName: assignedStaff,
    staffNote: staffNote.trim() || undefined,
  });

  async function handleParse() {
    setLoading('parse');
    setError(null);
    setSuccess(null);
    setCalendarLink(null);
    setPreview(null);
    setParsedBy(null);

    const res = await fetch(`${STAFF_API}/bookings/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    });
    const data = (await res.json()) as {
      preview?: BookingPreviewData;
      parsedBy?: 'rules' | 'ai';
      error?: string;
    };

    setLoading(null);
    if (!res.ok) {
      setError(data.error ?? '解析失敗');
      return;
    }
    setPreview(data.preview ?? null);
    setParsedBy(data.parsedBy ?? null);
  }

  async function handleCreate() {
    setLoading('create');
    setError(null);
    setSuccess(null);
    setCalendarLink(null);

    const res = await fetch(`${STAFF_API}/bookings/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    });
    const data = (await res.json()) as {
      calendarNote?: string;
      calendarHtmlLink?: string | null;
      preview?: BookingPreviewData;
      error?: string;
    };

    setLoading(null);
    if (!res.ok) {
      setError(data.error ?? '建立失敗');
      return;
    }

    if (data.preview) setPreview(data.preview);
    setSuccess(data.calendarNote ?? '預約已建立');
    setCalendarLink(data.calendarHtmlLink ?? null);
    setText('');
    setStaffNote('');
  }

  const placeholderStore = STORES.store1.messageStoreLabel;

  if (bootstrapping) {
    return (
      <PortalShell title="建立預約" variant="staff" size="xl">
        <p className="text-center text-sm text-muted-foreground">載入中…</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="建立預約"
      subtitle={`${staffName} · 貼上 LINE 訊息後建立 Google 日曆，結帳請至日曆操作`}
      variant="staff"
      size="xl"
      headerActions={
        <Button type="button" variant="ghost" size="sm" onClick={() => void portalLogout(router)}>
          <LogOut className="mr-1.5 size-4" />
          登出
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <WorkflowSteps active={workflowStep} />
        <Link
          href="/staff/clients"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
        >
          <Contact className="size-4" />
          客人資料庫
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="glass-card space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ClipboardPaste className="size-4 text-primary" />
            從 LINE 官方帳號複製完整訊息
          </div>
          <div className="space-y-2">
            <Label htmlFor="message" className="sr-only">
              預約訊息
            </Label>
            <textarea
              id="message"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPreview(null);
                setParsedBy(null);
                setSuccess(null);
                setCalendarLink(null);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) {
                  e.preventDefault();
                  void handleParse();
                }
              }}
              rows={14}
              placeholder={`【筋棧預約確認】\n${placeholderStore}\n姓名：王小明\n電話：0912345678\n項目：運動按摩 60min\n時間：2026-06-15 14:00`}
              className="input-neon w-full resize-y rounded-lg border border-input bg-input/80 px-3 py-3 font-mono text-sm leading-relaxed text-foreground"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assigned-staff">負責師傅</Label>
              <select
                id="assigned-staff"
                value={assignedStaff}
                onChange={(e) => {
                  setAssignedStaff(e.target.value);
                  setPreview(null);
                  setParsedBy(null);
                }}
                className="input-neon h-11 w-full rounded-lg border border-input bg-input/80 px-3 text-sm"
              >
                <option value={UNASSIGNED_STAFF_LABEL}>{UNASSIGNED_STAFF_LABEL}</option>
                {roster.map((member) => (
                  <option key={member.id} value={member.display_name}>
                    {member.display_name}
                  </option>
                ))}
                {assignedStaff && !roster.some((m) => m.display_name === assignedStaff) ? (
                  <option value={assignedStaff}>{assignedStaff}</option>
                ) : null}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-note">師傅備註（選填）</Label>
              <Input
                id="staff-note"
                value={staffNote}
                onChange={(e) => setStaffNote(e.target.value)}
                placeholder="例如：仁負責"
                className="input-neon h-11 border-input bg-input/80"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="sm:flex-1"
              disabled={!text.trim() || loading !== null}
              onClick={() => void handleParse()}
            >
              {loading === 'parse' ? '解析中…' : '預覽解析'}
            </Button>
            <Button
              type="button"
              className="sm:flex-1 shadow-md shadow-primary/20"
              disabled={!text.trim() || loading !== null}
              onClick={() => void handleCreate()}
            >
              {loading === 'create' ? '建立中…' : '建立預約'}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {error ? <StatusBanner variant="error">{error}</StatusBanner> : null}
          {success ? (
            <StatusBanner variant="success">
              {success}
              {calendarLink ? ' 請至 Google 日曆完成結帳。' : null}
            </StatusBanner>
          ) : null}
          {calendarLink ? (
            <a
              href={calendarLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary transition hover:bg-primary/15"
            >
              <ExternalLink className="size-4" />
              開啟 Google 日曆
            </a>
          ) : null}
          <BookingPreviewPanel preview={preview} parsedBy={parsedBy} />
        </div>
      </div>
    </PortalShell>
  );
}

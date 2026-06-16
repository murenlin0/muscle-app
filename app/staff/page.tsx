'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Contact, LogOut } from 'lucide-react';
import Link from 'next/link';
import { PortalShell } from '@/app/components/portal-shell';
import {
  BookingPreviewPanel,
  type BookingPreviewData,
} from '@/components/portal/booking-preview-panel';
import { StatusBanner } from '@/components/portal/status-banner';
import { WorkflowSteps, type WorkflowStepId } from '@/components/portal/workflow-steps';
import { portalLogout, usePortalGuard } from '@/components/portal/use-portal-guard';
import { StaffAppointmentList } from '@/components/portal/staff-appointment-list';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatStoreDateIso } from '@/lib/store-timezone';
import { STORES } from '@/lib/stores';

const STAFF_API = '/api/staff';

export default function StaffWorkspacePage() {
  const router = useRouter();
  const { session, loading: bootstrapping } = usePortalGuard('staff');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<BookingPreviewData | null>(null);
  const [loading, setLoading] = useState<'parse' | 'create' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [listKey, setListKey] = useState(0);
  const [calendarDate, setCalendarDate] = useState<string | undefined>();
  const calendarRef = useRef<HTMLDivElement>(null);

  const staffName = session?.role === 'staff' ? session.staffName : '';

  const workflowStep = useMemo((): WorkflowStepId => {
    if (success) return 'done';
    if (preview) return 'preview';
    return 'paste';
  }, [success, preview]);

  async function handleParse() {
    setLoading('parse');
    setError(null);
    setSuccess(null);
    setPreview(null);

    const res = await fetch(`${STAFF_API}/bookings/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = (await res.json()) as { preview?: BookingPreviewData; error?: string };

    setLoading(null);
    if (!res.ok) {
      setError(data.error ?? '解析失敗');
      return;
    }
    setPreview(data.preview ?? null);
  }

  async function handleCreate() {
    setLoading('create');
    setError(null);
    setSuccess(null);

    const res = await fetch(`${STAFF_API}/bookings/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = (await res.json()) as {
      calendarNote?: string;
      preview?: BookingPreviewData;
      error?: string;
    };

    setLoading(null);
    if (!res.ok) {
      setError(data.error ?? '建立失敗');
      return;
    }

    if (data.preview) {
      setPreview(data.preview);
      setCalendarDate(formatStoreDateIso(data.preview.startsAt));
    }
    setSuccess(data.calendarNote ?? '預約已建立');
    setText('');
    setListKey((k) => k + 1);
  }

  useEffect(() => {
    if (!success) return;
    calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [success, listKey]);

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
      subtitle={`${staffName} · 分店由訊息自動判斷`}
      variant="staff"
      size="full"
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

      {/* 預約日曆（置頂，建立後自動捲動到此） */}
      <div ref={calendarRef} className="mb-8 glass-card p-5 sm:p-6">
        <StaffAppointmentList key={listKey} initialDate={calendarDate} />
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
                setSuccess(null);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) {
                  e.preventDefault();
                  void handleParse();
                }
              }}
              rows={14}
              placeholder={`【筋棧預約確認】\n${placeholderStore}\n師傅：仁\n姓名：王小明\n電話：0912345678\n項目：運動按摩 60min\n時間：2026-06-15 14:00`}
              className="input-neon w-full resize-y rounded-lg border border-input bg-input/80 px-3 py-3 font-mono text-sm leading-relaxed text-foreground"
            />
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
          {success ? <StatusBanner variant="success">{success}</StatusBanner> : null}
          <BookingPreviewPanel preview={preview} />
        </div>
      </div>
    </PortalShell>
  );
}

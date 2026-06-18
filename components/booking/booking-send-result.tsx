'use client';

import { AlertTriangle, CheckCircle2, Copy, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  openOfficialLinePrefill,
  sendBookingToOfficialLine,
} from '@/lib/line-booking-send';
import type { StoreSlug } from '@/lib/stores';
import { cn } from '@/lib/utils';

function MessagePreview({ messageText }: { messageText: string }) {
  return (
    <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-input/40 p-4 font-mono text-sm leading-relaxed">
      {messageText}
    </pre>
  );
}

export function BookingSendChatOpened({
  messageText,
  onDone,
}: {
  messageText: string;
  onDone: () => void;
}) {
  return (
    <main className="min-h-svh px-5 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <div className="neon-panel border-2 border-primary/50 bg-primary/10 px-4 py-5 text-center shadow-[0_0_24px_oklch(0.58_0.19_252/0.2)]">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Send className="size-7 animate-pulse" strokeWidth={2.5} />
          </div>
          <p className="text-xl font-bold text-foreground">請按一下「傳送」</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            已開啟官方 LINE 對話，預約文字已帶入輸入框。
            <br />
            <span className="font-semibold text-primary">確認內容後，請按右下角「傳送」</span>
            ，預約才算完成。
          </p>
        </div>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">預約內容</CardTitle>
            <CardDescription>若對話沒有自動帶入，請對照下方文字</CardDescription>
          </CardHeader>
          <CardContent>
            <MessagePreview messageText={messageText} />
          </CardContent>
        </Card>

        <Button type="button" className="h-12 w-full text-base" onClick={onDone}>
          我已傳送，返回會員中心
        </Button>
      </div>
    </main>
  );
}

export function BookingSendCopied({
  messageText,
  storeSlug,
  lineOfficialUrl,
  onDone,
  onRetryOpenChat,
}: {
  messageText: string;
  storeSlug: StoreSlug;
  lineOfficialUrl: string;
  onDone: () => void;
  onRetryOpenChat: () => void;
}) {
  async function handleCopyAgain() {
    try {
      await navigator.clipboard.writeText(messageText);
    } catch {
      // 忽略
    }
  }

  async function handleOpenChat() {
    if (openOfficialLinePrefill(storeSlug, lineOfficialUrl, messageText)) {
      onRetryOpenChat();
      return;
    }
    const result = await sendBookingToOfficialLine(messageText, lineOfficialUrl, storeSlug);
    if (result.mode === 'chat_opened') onRetryOpenChat();
  }

  return (
    <main className="min-h-svh px-5 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <div
          className={cn(
            'rounded-2xl border-2 border-amber-400/70 bg-amber-500/15 px-4 py-5 text-center',
            'shadow-[0_0_28px_oklch(0.75_0.15_85/0.25)]',
          )}
        >
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-amber-500/25 text-amber-200">
            <AlertTriangle className="size-7" strokeWidth={2.5} />
          </div>
          <p className="text-xl font-bold text-amber-50">還差一步！請完成傳送</p>
          <p className="mt-2 text-sm leading-relaxed text-amber-100/90">
            預約文字已複製到剪貼簿，<span className="font-bold underline">不會自動送出</span>。
            請依下方步驟貼到官方 LINE，我們才能收到預約。
          </p>
        </div>

        <Card className="glass-card border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-5 text-amber-400" />
              請照這 3 步做
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/30 text-sm font-bold text-amber-50">
                1
              </span>
              <p className="pt-0.5 leading-relaxed">
                點下方 <span className="font-bold text-primary">「開啟官方 LINE 對話」</span>
                （會自動帶入文字，只需按傳送）
              </p>
            </div>
            <div className="flex gap-3 rounded-lg border border-border/50 bg-input/30 px-3 py-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                2
              </span>
              <p className="pt-0.5 leading-relaxed">
                若仍無法開啟：到官方 LINE 對話框 <span className="font-bold">長按 → 貼上</span>
              </p>
            </div>
            <div className="flex gap-3 rounded-lg border border-border/50 bg-input/30 px-3 py-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                3
              </span>
              <p className="pt-0.5 leading-relaxed">
                按 <span className="font-bold">「傳送」</span>，預約才算完成
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">預約內容（已複製）</CardTitle>
          </CardHeader>
          <CardContent>
            <MessagePreview messageText={messageText} />
          </CardContent>
        </Card>

        <Button
          type="button"
          className="h-12 w-full gap-2 text-base font-semibold"
          onClick={() => void handleOpenChat()}
        >
          <MessageCircle className="size-5" />
          開啟官方 LINE 對話（推薦）
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2"
          onClick={() => void handleCopyAgain()}
        >
          <Copy className="size-4" />
          再複製一次
        </Button>

        <Button type="button" variant="ghost" className="h-11 w-full text-muted-foreground" onClick={onDone}>
          返回會員中心
        </Button>
      </div>
    </main>
  );
}

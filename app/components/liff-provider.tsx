'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import liff from '@line/liff';
import { useStore } from '@/components/store-provider';
import { getLiffIdForStore } from '@/lib/store-liff';
import type { Client } from '@/lib/types/database';

type LiffStatus = 'loading' | 'ready' | 'error';

interface LiffContextValue {
  status: LiffStatus;
  error: string | null;
  loadingMessage: string;
  lineUserId: string | null;
  displayName: string | null;
  client: Client | null;
  refreshClient: () => Promise<void>;
}

const LiffContext = createContext<LiffContextValue | null>(null);

const DEV_LINE_USER_ID = process.env.NEXT_PUBLIC_DEV_LINE_USER_ID ?? 'dev-local-user-001';

/** 僅本機 dev server（localhost）略過 LIFF；正式／preview 環境不受影響 */
function isLocalDevPreview(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return host === 'localhost' || host === '127.0.0.1';
}

function apiHeaders(lineUserId: string): Record<string, string> {
  return {
    'x-line-user-id': lineUserId,
    'ngrok-skip-browser-warning': 'true',
  };
}

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const { apiBase, store } = useStore();
  const liffId = getLiffIdForStore(store.slug);
  const [status, setStatus] = useState<LiffStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('載入中…');
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);

  const fetchMe = useCallback(
    async (userId: string): Promise<Client | null> => {
      const res = await withTimeout(
        fetch(`${apiBase}/me`, { headers: apiHeaders(userId) }),
        15000,
        '連線伺服器逾時，請稍後再試',
      );
      const data = (await res.json()) as { client: Client | null; error?: string };
      if (!res.ok) {
        const hint =
          data.error?.includes('permission denied')
            ? '\n\n請確認 Supabase 已執行 02_rls.sql，且 Vercel 已設定 SUPABASE_SERVICE_ROLE_KEY。'
            : '';
        throw new Error((data.error ?? '無法取得會員資料') + hint);
      }
      return data.client;
    },
    [apiBase],
  );

  const refreshClient = useCallback(async () => {
    if (!lineUserId) return;
    const me = await fetchMe(lineUserId);
    setClient(me);
  }, [lineUserId, fetchMe]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        let userId: string;
        let name: string | null = null;

        if (liffId && !isLocalDevPreview()) {
          setLoadingMessage('正在連線 LINE…');
          await withTimeout(
            liff.init({ liffId }),
            20000,
            'LIFF 初始化逾時。請確認 LINE Developers 的 Endpoint URL 為 https://muscle.com.tw/store1/book',
          );

          if (!liff.isInClient() && !liff.isLoggedIn()) {
            throw new Error('請在 LINE App 內點開連結（不要用 Chrome / Safari 直接開）。');
          }

          if (!liff.isLoggedIn()) {
            setLoadingMessage('正在登入 LINE…');
            // 只用 pathname，避免 LIFF 回傳參數造成 redirect 迴圈
            const redirectUri = `${window.location.origin}${window.location.pathname}`;
            liff.login({ redirectUri });
            return;
          }

          setLoadingMessage('取得 LINE 個人資料…');
          const profile = await liff.getProfile();
          userId = profile.userId;
          name = profile.displayName;
        } else {
          userId = DEV_LINE_USER_ID;
          name = '本機測試';
        }

        if (cancelled) return;

        setLineUserId(userId);
        setDisplayName(name);
        setLoadingMessage('載入會員資料…');
        const me = await fetchMe(userId);
        if (cancelled) return;
        setClient(me);
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'LIFF 初始化失敗');
        setStatus('error');
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [fetchMe, liffId]);

  const value = useMemo(
    () => ({
      status,
      error,
      loadingMessage,
      lineUserId,
      displayName,
      client,
      refreshClient,
    }),
    [status, error, loadingMessage, lineUserId, displayName, client, refreshClient],
  );

  return <LiffContext.Provider value={value}>{children}</LiffContext.Provider>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

export function useLiff() {
  const ctx = useContext(LiffContext);
  if (!ctx) throw new Error('useLiff must be used within LiffProvider');
  return ctx;
}

export function useRequireLineUserId(): string {
  const { lineUserId, status } = useLiff();
  if (status !== 'ready' || !lineUserId) {
    throw new Error('LIFF not ready');
  }
  return lineUserId;
}

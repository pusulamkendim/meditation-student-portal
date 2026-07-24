'use client';

import { Button } from '@meditation/ui';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const refreshIntervalMilliseconds = 10 * 60 * 1000;
const refreshTimeoutMilliseconds = 8_000;

export function PortalSessionBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking');

  const renew = useCallback(async (initial: boolean) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), refreshTimeoutMilliseconds);
    try {
      const response = await fetch(`${apiUrl}/v1/admin/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'x-session-refresh': 'portal' },
        signal: controller.signal,
      });
      if (response.status === 401) {
        window.sessionStorage.removeItem('admin_csrf_token');
        window.location.assign('/login');
        return;
      }
      if (!response.ok) throw new Error(`Session refresh failed: ${response.status}`);
      const payload = (await response.json()) as { csrfToken: string };
      window.sessionStorage.setItem('admin_csrf_token', payload.csrfToken);
      setState('ready');
    } catch {
      if (initial) setState('error');
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void renew(true);
    const interval = window.setInterval(() => void renew(false), refreshIntervalMilliseconds);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void renew(false);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [renew]);

  if (state === 'checking') {
    return (
      <main className="session-boundary-state" aria-live="polite">
        <LoaderCircle className="ui-spinner" aria-hidden="true" />
        <strong>Oturum yenileniyor</strong>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="session-boundary-state" role="alert">
        <strong>Oturum yenilenemedi</strong>
        <p>API bağlantısını kontrol edip yeniden deneyin.</p>
        <Button
          onClick={() => {
            setState('checking');
            void renew(true);
          }}
        >
          <RefreshCw aria-hidden="true" />
          Yeniden dene
        </Button>
      </main>
    );
  }

  return children;
}

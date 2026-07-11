'use client';

import { type ReactNode, useEffect, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function PortalSessionBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const [authenticated, setAuthenticated] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setTimedOut(true);
      controller.abort();
    }, 8000);
    void fetch(`${apiUrl}/v1/admin/auth/me`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (response.ok) setAuthenticated(true);
        else window.location.replace('/login');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          window.location.replace('/login');
        }
      });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  if (!authenticated)
    return (
      <main className="session-loading">
        {timedOut ? (
          <a href="/login">Oturum açılamadı. Giriş sayfasına dön.</a>
        ) : (
          'Oturum doğrulanıyor...'
        )}
      </main>
    );
  return children;
}

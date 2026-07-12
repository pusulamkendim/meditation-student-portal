'use client';

import { type ReactNode, useEffect } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function PortalSessionBoundary({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiUrl}/v1/admin/auth/me`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 401) window.location.assign('/login');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) return;
      });
    return () => controller.abort();
  }, []);

  return children;
}

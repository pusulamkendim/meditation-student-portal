'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { initializeAnalytics, track } from '../../lib/analytics/client';

export function AnalyticsInitializer() {
  const pathname = usePathname();
  const lastTrackedPathname = useRef<string | null>(null);

  useEffect(() => {
    initializeAnalytics();
    if (!pathname || lastTrackedPathname.current === pathname) return;

    // Ignore effect replays, but count returning to a page after navigating away.
    lastTrackedPathname.current = pathname;
    track('page_view');
  }, [pathname]);

  return null;
}

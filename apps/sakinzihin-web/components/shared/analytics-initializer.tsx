'use client';

import { useEffect } from 'react';

import { initializeAnalytics } from '../../lib/analytics/client';

export function AnalyticsInitializer() {
  useEffect(() => {
    initializeAnalytics();
  }, []);

  return null;
}

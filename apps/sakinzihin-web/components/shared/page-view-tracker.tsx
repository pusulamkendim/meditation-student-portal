'use client';

import { useEffect } from 'react';

import { track, type AnalyticsEventName } from '../../lib/analytics/client';

export function PageViewTracker({
  event,
  location,
}: {
  event: AnalyticsEventName;
  location: string;
}) {
  useEffect(() => {
    track(event, { location });
  }, [event, location]);

  return null;
}

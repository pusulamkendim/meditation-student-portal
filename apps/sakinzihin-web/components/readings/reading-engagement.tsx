'use client';

import { useEffect } from 'react';

import { apiUrl } from '../../lib/api/client';
import { track } from '../../lib/analytics/client';

const visitorStorageKey = 'meditation_public_reader_id';

function getVisitorId(): string {
  const current = window.localStorage.getItem(visitorStorageKey);
  if (current) return current;
  const next = crypto.randomUUID();
  window.localStorage.setItem(visitorStorageKey, next);
  return next;
}

export function ReadingEngagement({
  slug,
  sectionPositions,
}: {
  slug: string;
  sectionPositions: number[];
}) {
  useEffect(() => {
    const visitorId = getVisitorId();
    const basePath = `/v1/readings/public/${encodeURIComponent(slug)}`;
    const post = (path: string, body: Record<string, unknown>) =>
      fetch(apiUrl(path), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => undefined);

    const params = new URLSearchParams(window.location.search);
    post(`${basePath}/access`, {
      visitorId,
      source: params.get('utm_source') ?? undefined,
      medium: params.get('utm_medium') ?? undefined,
      campaign: params.get('utm_campaign') ?? undefined,
    });
    track('reading_view', { slug });

    const seen = new Set<number>();
    let maxPosition = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const position = Number((entry.target as HTMLElement).dataset.position);
          if (!Number.isInteger(position) || seen.has(position)) continue;
          seen.add(position);
          maxPosition = Math.max(maxPosition, position);
          const percent = Math.round((maxPosition / Math.max(sectionPositions.length, 1)) * 100);
          post(`${basePath}/progress`, {
            visitorId,
            sectionPosition: position,
            progressPercent: percent,
          });
        }
      },
      { rootMargin: '-18% 0px -55% 0px' },
    );

    sectionPositions.forEach((position) => {
      const element = document.getElementById(`reading-section-${position}`);
      if (!element) return;
      element.dataset.position = String(position);
      observer.observe(element);
    });

    const endElement = document.getElementById('reading-end');
    const endObserver = endElement
      ? new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            post(`${basePath}/complete`, { visitorId });
          }
        })
      : null;
    if (endElement && endObserver) endObserver.observe(endElement);

    const heartbeat = window.setInterval(() => {
      post(`${basePath}/heartbeat`, { visitorId });
    }, 60_000);

    return () => {
      observer.disconnect();
      endObserver?.disconnect();
      window.clearInterval(heartbeat);
    };
  }, [slug, sectionPositions]);

  return null;
}

'use client';

import { Check, Download, Share2 } from 'lucide-react';
import { useState } from 'react';

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

export function ReadingActions({
  slug,
  title,
  hasPdf,
}: {
  slug: string;
  title: string;
  hasPdf: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function share() {
    const url = window.location.href;
    track('reading_cta_click', { location: 'reading-share', slug });
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const response = await fetch(apiUrl(`/v1/readings/public/${encodeURIComponent(slug)}/pdf`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorId: getVisitorId() }),
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${slug}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="reading-actions">
      <button type="button" onClick={share} aria-label="Yazıyı paylaş">
        {copied ? <Check size={17} /> : <Share2 size={17} />}
        {copied ? 'Bağlantı kopyalandı' : 'Paylaş'}
      </button>
      {hasPdf ? (
        <button type="button" onClick={downloadPdf} disabled={downloading} aria-label="PDF indir">
          <Download size={17} /> {downloading ? 'İndiriliyor' : 'PDF’i indir'}
        </button>
      ) : null}
    </div>
  );
}

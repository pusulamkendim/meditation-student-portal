'use client';

import { Alert, Badge, EmptyState, PageHeader, Skeleton } from '@meditation/ui';
import { Building2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Inquiry = {
  id: string;
  status: 'NEW' | 'CONTACTED' | 'CLOSED' | 'SPAM';
  firstName?: string;
  lastName?: string;
  company?: string;
  source?: string;
  medium?: string;
  createdAt: string;
  personalDataDeletedAt?: string;
};
const statusLabel = { NEW: 'Yeni', CONTACTED: 'İletişime geçildi', CLOSED: 'Kapalı', SPAM: 'Spam' };
const statusTone = {
  NEW: 'warning',
  CONTACTED: 'info',
  CLOSED: 'success',
  SPAM: 'neutral',
} as const;

export default function CorporateInquiriesPage() {
  const [items, setItems] = useState<Inquiry[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch(`${api}/v1/admin/corporate-inquiries`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ items: Inquiry[] }>;
      })
      .then((result) => setItems(result.items))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Bağlantı hatası'));
  }, []);
  return (
    <main className="content corporate-admin-page">
      <PageHeader
        title="Kurumsal Talepler"
        description="Kurumlar için bireysel mindfulness çalışma talepleri"
      />
      {error ? <Alert tone="danger">Talepler yüklenemedi: {error}</Alert> : null}
      {!items ? (
        <div className="preview-stack">
          <Skeleton />
          <Skeleton />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Building2} title="Henüz kurumsal talep yok" />
      ) : (
        <div className="corporate-admin-list">
          <div className="corporate-admin-list-head">
            <span>Firma ve kişi</span>
            <span>Kaynak</span>
            <span>Tarih</span>
            <span>Durum</span>
            <span />
          </div>
          {items.map((item) => (
            <Link href={`/corporate-inquiries/${item.id}`} key={item.id}>
              <span>
                <strong>{item.company ?? 'Kişisel veriler silindi'}</strong>
                <small>{[item.firstName, item.lastName].filter(Boolean).join(' ') || '—'}</small>
              </span>
              <span>{[item.source, item.medium].filter(Boolean).join(' · ') || 'Doğrudan'}</span>
              <span>
                {new Intl.DateTimeFormat('tr-TR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(item.createdAt))}
              </span>
              <Badge tone={statusTone[item.status]}>{statusLabel[item.status]}</Badge>
              <ChevronRight />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

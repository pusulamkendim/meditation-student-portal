'use client';

import { Alert, Badge, Button, PageHeader, Skeleton } from '@meditation/ui';
import { Mail } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Status = 'NEW' | 'CONTACTED' | 'CLOSED' | 'SPAM';
type Inquiry = {
  id: string;
  status: Status;
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  note?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  createdAt: string;
  privacyNoticeVersion: string;
  privacyNoticeAcceptedAt: string;
  personalDataDeletedAt?: string;
};
const labels: Record<Status, string> = {
  NEW: 'Yeni',
  CONTACTED: 'İletişime geçildi',
  CLOSED: 'Kapalı',
  SPAM: 'Spam',
};

export default function CorporateInquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Inquiry>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`${api}/v1/admin/corporate-inquiries/${id}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setItem((await response.json()) as Inquiry);
  }, [id]);
  useEffect(() => {
    void load().catch((reason) =>
      setError(reason instanceof Error ? reason.message : 'Bağlantı hatası'),
    );
  }, [load]);
  async function changeStatus(status: Status) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`${api}/v1/admin/corporate-inquiries/${id}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="content corporate-admin-page">
      <PageHeader
        title={item?.company ?? 'Kurumsal talep'}
        description="Başvuru ayrıntıları ve iletişim durumu"
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!item ? (
        <Skeleton />
      ) : (
        <div className="corporate-admin-detail">
          <section>
            <header>
              <div>
                <span>Başvuru sahibi</span>
                <h2>
                  {[item.firstName, item.lastName].filter(Boolean).join(' ') ||
                    'Kişisel veriler silindi'}
                </h2>
              </div>
              <Badge>{labels[item.status]}</Badge>
            </header>
            <dl>
              <div>
                <dt>Firma</dt>
                <dd>{item.company ?? '—'}</dd>
              </div>
              <div>
                <dt>E-posta</dt>
                <dd>{item.email ?? '—'}</dd>
              </div>
              <div>
                <dt>Kaynak</dt>
                <dd>
                  {[item.source, item.medium, item.campaign].filter(Boolean).join(' · ') ||
                    'Doğrudan'}
                </dd>
              </div>
              <div>
                <dt>Başvuru</dt>
                <dd>
                  {new Intl.DateTimeFormat('tr-TR', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  }).format(new Date(item.createdAt))}
                </dd>
              </div>
            </dl>
            <div className="corporate-admin-note">
              <span>Not</span>
              <p>{item.note ?? 'Kişisel veri saklama süresi dolduğu için silindi.'}</p>
            </div>
            <small>
              {item.privacyNoticeVersion} ·{' '}
              {new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(item.privacyNoticeAcceptedAt),
              )}
            </small>
          </section>
          <aside>
            {item.email ? (
              <a
                className="ui-button ui-button--primary"
                href={`mailto:${item.email}?subject=${encodeURIComponent(`${item.company ?? 'Kurum'} için mindfulness görüşmesi`)}`}
              >
                <Mail /> E-posta gönder
              </a>
            ) : null}
            <Button disabled={busy} onClick={() => void changeStatus('CONTACTED')}>
              İletişime geçildi
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void changeStatus('CLOSED')}>
              Kapat
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void changeStatus('SPAM')}>
              Spam
            </Button>
          </aside>
        </div>
      )}
    </main>
  );
}

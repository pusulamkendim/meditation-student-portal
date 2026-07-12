'use client';
import { Alert, Badge, EmptyState, PageHeader, Skeleton } from '@meditation/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Detail = {
  id: string;
  status: string;
  registrationStep: string;
  timezone: string;
  curriculumStage: string;
  subscriptions: Array<{
    id: string;
    status: string;
    startDate: string;
    endExclusive: string;
    priceMinor: string;
    currency: string;
    credits: number;
  }>;
  channels: Array<{
    id: string;
    type: string;
    status: string;
    isDefault: boolean;
    lastInboundAt?: string;
  }>;
  consents: Array<{ scope: string; status: string; occurredAt: string }>;
  payments: Array<{ id: string; status: string; referenceCode: string }>;
};
export default function StudentDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<Detail>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void fetch(`${api}/v1/admin/students/${studentId}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Hata'));
  }, [studentId]);
  if (error)
    return (
      <main className="content">
        <Alert tone="danger">{error}</Alert>
      </main>
    );
  if (!data)
    return (
      <main className="content">
        <Skeleton />
      </main>
    );
  return (
    <main className="content">
      <PageHeader
        title={`Öğrenci ${data.id.slice(0, 8)}`}
        description={`${data.registrationStep} · ${data.timezone}`}
        actions={
          <Badge tone={data.status === 'ACTIVE' ? 'success' : 'neutral'}>{data.status}</Badge>
        }
      />
      <div className="student-detail-grid">
        <section>
          <h2>Üyelik dönemleri</h2>
          {data.subscriptions.length ? (
            data.subscriptions.map((s) => (
              <article className="detail-record" key={s.id}>
                <strong>
                  {new Date(s.startDate).toLocaleDateString('tr-TR')} –{' '}
                  {new Date(s.endExclusive).toLocaleDateString('tr-TR')}
                </strong>
                <span>
                  {s.status} · {s.credits} görüşme kredisi
                </span>
              </article>
            ))
          ) : (
            <EmptyState title="Üyelik yok" />
          )}
        </section>
        <section>
          <h2>Kanallar</h2>
          {data.channels.map((c) => (
            <article className="detail-record" key={c.id}>
              <strong>
                {c.type}
                {c.isDefault ? ' · Varsayılan' : ''}
              </strong>
              <span>{c.status}</span>
            </article>
          ))}
        </section>
        <section>
          <h2>Rızalar</h2>
          {data.consents.map((c, i) => (
            <article className="detail-record" key={`${c.scope}-${i}`}>
              <strong>{c.scope}</strong>
              <span>
                {c.status} · {new Date(c.occurredAt).toLocaleDateString('tr-TR')}
              </span>
            </article>
          ))}
        </section>
        <section>
          <h2>Ödemeler</h2>
          {data.payments.map((p) => (
            <article className="detail-record" key={p.id}>
              <strong>{p.referenceCode}</strong>
              <span>{p.status}</span>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

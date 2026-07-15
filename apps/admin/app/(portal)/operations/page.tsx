'use client';
import { Alert, Badge, Button, EmptyState, Metric, PageHeader, Skeleton } from '@meditation/ui';
import { AlertTriangle, Clock3, Inbox, LifeBuoy, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Data = {
  counts: { pending: number; failed: number; suppressed: number; openHandoffs: number };
  recentIntents: Array<{
    id: string;
    category: string;
    status: string;
    suppressionReason?: string;
    updatedAt: string;
  }>;
  webhooks: Array<{
    id: string;
    channel: string;
    eventType: string;
    result: string;
    createdAt: string;
  }>;
  deliveries: Array<{
    id: string;
    channel: string;
    eventType: string;
    status: string;
    attempts: number;
    errorCode?: string;
    updatedAt: string;
  }>;
  handoffs: Array<{
    id: string;
    studentId: string;
    reason: string;
    createdAt: string;
    student: { status: string };
  }>;
};
const tone = (status: string): 'success' | 'warning' | 'danger' | 'neutral' =>
  status === 'FAILED'
    ? 'danger'
    : status === 'PENDING'
      ? 'warning'
      : status === 'PROCESSED' || status === 'SENT'
        ? 'success'
        : 'neutral';
export default function OperationsPage() {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const response = await fetch(`${api}/v1/admin/operations`, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as Data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Operasyon verileri yüklenemedi.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <main className="content">
      <PageHeader
        title="Operasyon"
        description="Mesaj kuyruğu, webhook ve bildirim teslimat sağlığı"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw />
            Yenile
          </Button>
        }
      />
      {error ? (
        <Alert tone="danger" title="Operasyon görünümü açılamadı">
          {error}
        </Alert>
      ) : !data ? (
        <div className="preview-stack">
          <Skeleton />
          <Skeleton />
        </div>
      ) : (
        <>
          <div className="metrics operations-metrics">
            <Metric
              icon={Clock3}
              label="Bekleyen mesaj"
              value={data.counts.pending}
              detail="Gönderim kuyruğunda"
            />
            <Metric
              icon={AlertTriangle}
              label="Başarısız"
              value={data.counts.failed}
              detail="İnceleme gerekiyor"
            />
            <Metric
              icon={ShieldCheck}
              label="Bastırılan"
              value={data.counts.suppressed}
              detail="Politika nedeniyle"
            />
            <Metric
              icon={LifeBuoy}
              label="Açık handover"
              value={data.counts.openHandoffs}
              detail="Admin yanıtı bekliyor"
            />
          </div>
          <section className="operation-handoffs">
            <div className="section-heading">
              <h2>Yanıt bekleyen handover’lar</h2>
              <Badge tone={data.handoffs.length ? 'warning' : 'success'}>
                {data.handoffs.length}
              </Badge>
            </div>
            {data.handoffs.length ? (
              <div className="operation-list">
                {data.handoffs.map((handoff) => (
                  <article key={handoff.id}>
                    <div>
                      <a href={`/students/${handoff.studentId}`}>
                        Öğrenci {handoff.studentId.slice(0, 8)}
                      </a>
                      <small>
                        {handoff.student.status} ·{' '}
                        {new Date(handoff.createdAt).toLocaleString('tr-TR')}
                      </small>
                    </div>
                    <Badge tone="warning">Yanıt bekliyor</Badge>
                    <p className="operation-handoff-reason">{handoff.reason}</p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={LifeBuoy}
                title="Açık handover yok"
                description="Admin yanıtı bekleyen öğrenci mesajı bulunmuyor."
              />
            )}
          </section>
          <div className="operations-grid">
            <section>
              <div className="section-heading">
                <h2>Mesaj kuyruğu</h2>
              </div>
              {data.recentIntents.length ? (
                <div className="operation-list">
                  {data.recentIntents.map((item) => (
                    <article key={item.id}>
                      <div>
                        <strong>{item.category}</strong>
                        <small>{new Date(item.updatedAt).toLocaleString('tr-TR')}</small>
                      </div>
                      <Badge tone={tone(item.status)}>{item.status}</Badge>
                      {item.suppressionReason ? <p>{item.suppressionReason}</p> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Inbox}
                  title="Kuyruk temiz"
                  description="İncelenecek mesaj niyeti bulunmuyor."
                />
              )}
            </section>
            <section>
              <div className="section-heading">
                <h2>Son webhooklar</h2>
              </div>
              {data.webhooks.length ? (
                <div className="operation-list">
                  {data.webhooks.map((item) => (
                    <article key={item.id}>
                      <div>
                        <strong>
                          {item.channel} · {item.eventType}
                        </strong>
                        <small>{new Date(item.createdAt).toLocaleString('tr-TR')}</small>
                      </div>
                      <Badge tone={tone(item.result)}>{item.result}</Badge>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState title="Webhook kaydı yok" />
              )}
              <div className="section-heading">
                <h2>Admin bildirimleri</h2>
              </div>
              {data.deliveries.length ? (
                <div className="operation-list">
                  {data.deliveries.map((item) => (
                    <article key={item.id}>
                      <div>
                        <strong>
                          {item.channel} · {item.eventType}
                        </strong>
                        <small>
                          {item.attempts} deneme ·{' '}
                          {new Date(item.updatedAt).toLocaleString('tr-TR')}
                        </small>
                      </div>
                      <Badge tone={tone(item.status)}>{item.status}</Badge>
                      {item.errorCode ? <p>{item.errorCode}</p> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState title="Bildirim teslimatı yok" />
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}

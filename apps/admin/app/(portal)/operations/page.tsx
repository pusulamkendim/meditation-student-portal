'use client';
import { Alert, Badge, Button, EmptyState, Metric, PageHeader, Skeleton } from '@meditation/ui';
import {
  AlertTriangle,
  Bell,
  Clock3,
  Inbox,
  LifeBuoy,
  Radio,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Data = {
  counts: { pending: number; failed: number; suppressed: number; openHandoffs: number };
  recentIntents: Array<{
    id: string;
    category: string;
    status: string;
    suppressionReason?: string;
    dueAt: string;
    updatedAt: string;
    student: { id: string; fullName?: string };
  }>;
  webhooks: Array<{
    id: string;
    channel: string;
    eventType: string;
    result: string;
    createdAt: string;
    student?: { id: string; fullName?: string };
  }>;
  deliveries: Array<{
    id: string;
    channel: string;
    eventType: string;
    status: string;
    attempts: number;
    errorCode?: string;
    updatedAt: string;
    student?: { id: string; fullName?: string };
  }>;
  handoffs: Array<{
    id: string;
    studentId: string;
    reason: string;
    createdAt: string;
    student: { id: string; fullName?: string; status: string };
  }>;
};
const categoryLabels: Record<string, string> = {
  PRACTICE_CHECKIN: 'Pratik geri bildirimi',
  PRACTICE_REMINDER: 'Pratik hatırlatması',
  PRACTICE_PLAN_CONFIRMED: 'Pratik planı',
  MEETING_REMINDER: 'Görüşme hatırlatması',
  MEETING_SCHEDULED: 'Görüşme planı',
  ADMIN_REPLY: 'Admin yanıtı',
  SYSTEM_STANDARD_MESSAGE: 'Sistem mesajı',
};
const eventLabels: Record<string, string> = {
  MESSAGE_RECEIVED: 'Öğrenci mesajı alındı',
  ADMIN_HANDOFF_REQUIRED: 'Admin yanıtı gerekiyor',
  CalendarDiscrepancy: 'Google Calendar ile görüşme saati uyuşmuyor',
};
const reasonLabels: Record<string, string> = {
  WHATSAPP_TEMPLATE_REQUIRED: 'WhatsApp 24 saat penceresi kapalı; onaylı template gerekli.',
  STUDENT_INACTIVE: 'Öğrenci aktif olmadığı için gönderilmedi.',
  PROACTIVE_MESSAGING_PAUSED: 'Öğrencinin proaktif mesajları duraklatılmış.',
};
const statusLabels: Record<string, string> = {
  PENDING: 'Bekliyor',
  FAILED: 'Başarısız',
  SUPPRESSED: 'Gönderilmedi',
  PROCESSED: 'İşlendi',
  SENT: 'İletildi',
  RESOLVED: 'Çözüldü',
};
function studentName(student?: { id: string; fullName?: string }) {
  if (!student) return 'Öğrenciyle eşleşmeyen sistem kaydı';
  return student.fullName ?? `İsimsiz öğrenci · ${student.id.slice(0, 8)}`;
}
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
  const [activeTab, setActiveTab] = useState<'ACTION' | 'CHANNEL' | 'NOTIFICATIONS'>('ACTION');
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
          <nav className="workspace-tabs operation-tabs" aria-label="Operasyon görünümleri">
            <button data-active={activeTab === 'ACTION'} onClick={() => setActiveTab('ACTION')}>
              <AlertTriangle aria-hidden="true" /> Aksiyon gerekenler
              <small>{data.counts.failed + data.counts.pending + data.counts.openHandoffs}</small>
            </button>
            <button data-active={activeTab === 'CHANNEL'} onClick={() => setActiveTab('CHANNEL')}>
              <Radio aria-hidden="true" /> Kanal hareketleri <small>{data.webhooks.length}</small>
            </button>
            <button
              data-active={activeTab === 'NOTIFICATIONS'}
              onClick={() => setActiveTab('NOTIFICATIONS')}
            >
              <Bell aria-hidden="true" /> Admin bildirimleri <small>{data.deliveries.length}</small>
            </button>
          </nav>

          {activeTab === 'ACTION' ? (
            <div className="operations-grid operations-grid--readable">
              <section className="operation-section">
                <div className="section-heading">
                  <div>
                    <h2>Yanıt bekleyen handover’lar</h2>
                    <p>Öğrenciye admin yanıtı verilmesi gereken konuşmalar.</p>
                  </div>
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
                            <strong>{studentName(handoff.student)}</strong>
                          </a>
                          <small>{new Date(handoff.createdAt).toLocaleString('tr-TR')}</small>
                        </div>
                        <Badge tone="warning">Yanıt bekliyor</Badge>
                        <p className="operation-handoff-reason">{handoff.reason}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={LifeBuoy} title="Açık handover yok" />
                )}
              </section>
              <section className="operation-section">
                <div className="section-heading">
                  <div>
                    <h2>İşlem gerektiren mesajlar</h2>
                    <p>Bekleyen, gönderilemeyen veya politika nedeniyle durdurulan mesajlar.</p>
                  </div>
                </div>
                {data.recentIntents.length ? (
                  <div className="operation-list">
                    {data.recentIntents.map((item) => (
                      <article key={item.id}>
                        <div>
                          <a href={`/students/${item.student.id}`}>
                            <strong>{studentName(item.student)}</strong>
                          </a>
                          <small>
                            {categoryLabels[item.category] ?? item.category} ·{' '}
                            {new Date(item.updatedAt).toLocaleString('tr-TR')}
                          </small>
                        </div>
                        <Badge tone={tone(item.status)}>
                          {statusLabels[item.status] ?? item.status}
                        </Badge>
                        {item.suppressionReason ? (
                          <p>{reasonLabels[item.suppressionReason] ?? item.suppressionReason}</p>
                        ) : null}
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
            </div>
          ) : null}

          {activeTab === 'CHANNEL' ? (
            <section className="operation-section operation-section--wide">
              <div className="section-heading">
                <div>
                  <h2>Kanal hareketleri</h2>
                  <p>WhatsApp ve Telegram’dan alınan son olaylar.</p>
                </div>
              </div>
              {data.webhooks.length ? (
                <div className="operation-list">
                  {data.webhooks.map((item) => (
                    <article key={item.id}>
                      <div>
                        {item.student ? (
                          <a href={`/students/${item.student.id}`}>
                            <strong>{studentName(item.student)}</strong>
                          </a>
                        ) : (
                          <strong>{studentName()}</strong>
                        )}
                        <small>
                          {eventLabels[item.eventType] ?? item.eventType} · {item.channel} ·{' '}
                          {new Date(item.createdAt).toLocaleString('tr-TR')}
                        </small>
                      </div>
                      <Badge tone={tone(item.result)}>
                        {statusLabels[item.result] ?? item.result}
                      </Badge>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState title="Webhook kaydı yok" />
              )}
            </section>
          ) : null}

          {activeTab === 'NOTIFICATIONS' ? (
            <section className="operation-section operation-section--wide">
              <div className="section-heading">
                <div>
                  <h2>Admin bildirimleri</h2>
                  <p>Panel veya e-posta üzerinden yöneticilere iletilen uyarılar.</p>
                </div>
              </div>
              {data.deliveries.length ? (
                <div className="operation-list">
                  {data.deliveries.map((item) => (
                    <article key={item.id}>
                      <div>
                        {item.student ? (
                          <a href={`/students/${item.student.id}`}>
                            <strong>{studentName(item.student)}</strong>
                          </a>
                        ) : (
                          <strong>{studentName()}</strong>
                        )}
                        <small>
                          {eventLabels[item.eventType] ?? item.eventType} · {item.channel} ·{' '}
                          {item.attempts} deneme ·{' '}
                          {new Date(item.updatedAt).toLocaleString('tr-TR')}
                        </small>
                      </div>
                      <Badge tone={tone(item.status)}>
                        {statusLabels[item.status] ?? item.status}
                      </Badge>
                      {item.errorCode ? <p>{item.errorCode}</p> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState title="Bildirim teslimatı yok" />
              )}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

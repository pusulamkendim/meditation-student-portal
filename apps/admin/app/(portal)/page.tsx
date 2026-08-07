'use client';

import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  LifeBuoy,
  MessageSquareText,
  Minus,
  RefreshCw,
} from 'lucide-react';
import { Alert, Badge, Button, EmptyState, Metric, PageHeader, Skeleton } from '@meditation/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type Comparison = {
  completed: number;
  skipped: number;
  missed: number;
  pending?: number;
  completionRate: number;
  responseRate?: number;
  reflectionRate?: number;
};

type PulseInsight = {
  tone: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  confidence: number;
  suggestedAction: 'KEEP' | 'SIMPLIFY' | 'DISCUSS';
  safetyConcern: boolean;
  reflectionCount: number;
  generatedAt: string;
  summary?: string;
  strengths: string[];
  challenges: string[];
  coachTopics: string[];
};

type DashboardData = {
  generatedAt: string;
  counts: {
    activeStudents: number;
    paymentReviews: number;
    recentMessages: number;
    failedMessages: number;
    openHandoffs: number;
    todayMeetings: number;
  };
  practice: Comparison & {
    periodStart: string;
    periodEndExclusive: string;
    reflectionRate: number;
    responseRate: number;
    trend: number;
    previous: Comparison;
    deltas: { completionRate: number; responseRate: number; reflectionRate: number };
    daily: Array<{
      date: string;
      completed: number;
      skipped: number;
      missed: number;
      pending: number;
    }>;
    slots: Array<{ slotKey: string; completed: number; total: number; completionRate: number }>;
  };
  studentPulse: Array<{
    id: string;
    fullName?: string;
    channel?: string;
    lastInboundAt?: string;
    completed: number;
    skipped: number;
    missed: number;
    pending: number;
    reflections: number;
    completionRate: number;
    trend: number;
    previous: Comparison & { reflections: number };
    insight?: PulseInsight;
    openHandoffs: number;
    schedule: Array<{ slotKey: string; localTime: string; durationMinutes: number }>;
    recommendation?: string;
  }>;
  recentMessages: Array<{
    id: string;
    studentId?: string;
    fullName?: string;
    channel: string;
    content?: string;
    source: 'READING' | 'MEDITATION' | 'PRACTICE' | 'GENERAL';
    occurredAt: string;
  }>;
  failedMessages: Array<{
    id: string;
    studentId: string;
    fullName?: string;
    channel: string;
    category: string;
    status: string;
    reason?: string;
    preview?: string;
    updatedAt: string;
  }>;
  handoffs: Array<{
    id: string;
    studentId: string;
    fullName?: string;
    reason: string;
    createdAt: string;
  }>;
  meetings: Array<{
    id: string;
    studentId: string;
    fullName?: string;
    startsAt: string;
    endsAt: string;
    status: string;
  }>;
  content: {
    assignments: Record<string, number>;
    readings: { visitors: number; views: number; pdfDownloads: number; whatsappClicks: number };
    meditations: {
      visitors: number;
      views: number;
      starts: number;
      completions: number;
      ctaClicks: number;
    };
  };
};

const sourceLabels = {
  READING: 'Okumadan geldi',
  MEDITATION: 'Meditasyondan geldi',
  PRACTICE: 'Pratik yanıtı',
  GENERAL: 'Genel mesaj',
};

const categoryLabels: Record<string, string> = {
  PRACTICE_CHECKIN: 'Pratik geri bildirimi',
  PRACTICE_REMINDER: 'Pratik hatırlatması',
  MEETING_REMINDER: 'Görüşme hatırlatması',
  ADMIN_REPLY: 'Admin yanıtı',
  SYSTEM_STANDARD_MESSAGE: 'Sistem mesajı',
};

const reasonLabels: Record<string, string> = {
  WHATSAPP_TEMPLATE_REQUIRED: 'WhatsApp 24 saat penceresi kapalı; onaylı şablon gerekli.',
  STUDENT_INACTIVE: 'Öğrenci aktif olmadığı için gönderilmedi.',
  STALE_AGGREGATE: 'İlgili kayıt daha sonra değiştirildiği için mesaj geçersiz kaldı.',
  PROACTIVE_MESSAGING_PAUSED: 'Öğrencinin otomatik mesajları duraklatılmış.',
};

const toneLabels: Record<PulseInsight['tone'], string> = {
  POSITIVE: 'Pozitif',
  NEUTRAL: 'Nötr',
  NEGATIVE: 'Negatif',
};

const actionLabels: Record<PulseInsight['suggestedAction'], string> = {
  KEEP: 'Programı koru',
  SIMPLIFY: 'Sadeleştirmeyi değerlendir',
  DISCUSS: 'Görüşmede ele al',
};

function name(value?: string, id?: string) {
  return value ?? (id ? `İsimsiz öğrenci · ${id.slice(0, 8)}` : 'Kayıtlı olmayan kişi');
}

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'short' });
}

function deltaText(value: number) {
  if (value === 0) return 'Değişmedi';
  return `${value > 0 ? '+' : ''}${value} puan`;
}

function Trend({ value, label }: { value: number; label?: string }) {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`dashboard-trend is-${value > 0 ? 'up' : value < 0 ? 'down' : 'flat'}`}>
      <Icon aria-hidden="true" />
      <span>{label ?? deltaText(value)}</span>
    </span>
  );
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    setError(undefined);
    try {
      const response = await fetch(`${api}/v1/admin/dashboard`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as DashboardData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Genel Bakış yüklenemedi.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const maximumDaily = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.practice.daily.map(
          (item) => item.completed + item.skipped + item.missed + item.pending,
        ) ?? []),
      ),
    [data],
  );

  return (
    <main className="content dashboard-page">
      <PageHeader
        title="Genel Bakış"
        description="Öğrenci iletişimi, pratik düzeni ve içerik etkileşiminin günlük çalışma alanı"
        actions={
          <Button variant="secondary" disabled={refreshing} onClick={() => void load()}>
            <RefreshCw className={refreshing ? 'ui-spinner' : undefined} />
            Yenile
          </Button>
        }
      />

      {error ? (
        <Alert tone="danger" title="Genel Bakış yüklenemedi">
          {error}
        </Alert>
      ) : !data ? (
        <div className="dashboard-loading">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : (
        <>
          <p className="dashboard-updated">
            Son güncelleme: {new Date(data.generatedAt).toLocaleString('tr-TR')}
          </p>

          <div className="dashboard-top-grid">
            <section className="dashboard-panel dashboard-chart-panel dashboard-practice-primary">
              <div className="dashboard-panel-heading">
                <div>
                  <span>PRATİK TAKİBİ · SON 7 TAM GÜN</span>
                  <h2>Haftalık sonuçlar</h2>
                  <p>Bir önceki 7 günlük dönemle karşılaştırma</p>
                </div>
                <Trend value={data.practice.deltas.completionRate} />
              </div>
              <div className="dashboard-practice-summary is-comparison">
                <div>
                  <span>Tamamlama</span>
                  <strong>%{data.practice.completionRate}</strong>
                  <small>Önceki %{data.practice.previous.completionRate}</small>
                  <Trend value={data.practice.deltas.completionRate} />
                </div>
                <div>
                  <span>Yanıt</span>
                  <strong>%{data.practice.responseRate}</strong>
                  <small>Önceki %{data.practice.previous.responseRate}</small>
                  <Trend value={data.practice.deltas.responseRate} />
                </div>
                <div>
                  <span>Refleksiyon</span>
                  <strong>%{data.practice.reflectionRate}</strong>
                  <small>Önceki %{data.practice.previous.reflectionRate}</small>
                  <Trend value={data.practice.deltas.reflectionRate} />
                </div>
                <div>
                  <span>Tamamlanan</span>
                  <strong>{data.practice.completed}</strong>
                  <small>Önceki {data.practice.previous.completed}</small>
                </div>
              </div>
              <div className="dashboard-chart-legend" aria-label="Pratik sonucu renkleri">
                <span>
                  <i className="is-completed" />
                  Tamamlandı
                </span>
                <span>
                  <i className="is-skipped" />
                  Yapılamadı
                </span>
                <span>
                  <i className="is-missed" />
                  Kaçırıldı
                </span>
                <span>
                  <i className="is-pending" />
                  Henüz sonuçlanmadı
                </span>
              </div>
              <div className="dashboard-bars" aria-label="Son yedi tam günün pratik sonuçları">
                {data.practice.daily.map((point) => {
                  const total = point.completed + point.skipped + point.missed + point.pending;
                  return (
                    <div key={point.date}>
                      <span className="dashboard-bar-track" title={`${total} sonuç`}>
                        <i
                          className="is-missed"
                          style={{ height: `${(point.missed / maximumDaily) * 100}%` }}
                        />
                        <i
                          className="is-skipped"
                          style={{ height: `${(point.skipped / maximumDaily) * 100}%` }}
                        />
                        <i
                          className="is-completed"
                          style={{ height: `${(point.completed / maximumDaily) * 100}%` }}
                        />
                        <i
                          className="is-pending"
                          style={{ height: `${(point.pending / maximumDaily) * 100}%` }}
                        />
                      </span>
                      <small>{dayLabel(point.date)}</small>
                    </div>
                  );
                })}
              </div>
              <div className="dashboard-slot-rates">
                {data.practice.slots.map((slot) => (
                  <div key={slot.slotKey}>
                    <span>
                      {slot.slotKey === 'MORNING'
                        ? 'Sabah'
                        : slot.slotKey === 'EVENING'
                          ? 'Akşam'
                          : slot.slotKey}
                    </span>
                    <strong>%{slot.completionRate}</strong>
                    <i>
                      <b style={{ width: `${slot.completionRate}%` }} />
                    </i>
                  </div>
                ))}
              </div>
            </section>

            <section className="dashboard-panel dashboard-content-panel dashboard-content-primary">
              <div className="dashboard-panel-heading">
                <div>
                  <span>İÇERİK ETKİLEŞİMİ</span>
                  <h2>Okuma ve meditasyonlar</h2>
                </div>
              </div>
              <a href="/readings">
                <BookOpen />
                <span>
                  <strong>Atanan okumalar</strong>
                  <small>
                    {data.content.assignments.COMPLETED ?? 0} tamamlandı ·{' '}
                    {data.content.assignments.OPENED ?? 0} okunuyor
                  </small>
                </span>
                <ArrowRight />
              </a>
              <div className="dashboard-content-metrics is-stacked">
                <article>
                  <span>Global okuma</span>
                  <strong>{data.content.readings.views}</strong>
                  <small>görüntülenme · {data.content.readings.whatsappClicks} WhatsApp</small>
                </article>
                <article>
                  <span>Global meditasyon</span>
                  <strong>{data.content.meditations.starts}</strong>
                  <small>başlatma · {data.content.meditations.completions} tamamlama</small>
                </article>
                <article>
                  <span>İlgi sinyali</span>
                  <strong>
                    {data.content.meditations.ctaClicks + data.content.readings.whatsappClicks}
                  </strong>
                  <small>toplam CTA tıklaması</small>
                </article>
              </div>
            </section>
          </div>

          <section className="dashboard-panel dashboard-pulse-panel">
            <div className="dashboard-panel-heading">
              <div>
                <span>ÖĞRENCİ DURUMLARI</span>
                <h2>Haftalık takip özeti</h2>
                <p>Pratik düzeni, önceki döneme göre değişim ve son refleksiyonların genel tonu</p>
              </div>
              <a href="/students">
                Öğrencileri aç <ArrowRight />
              </a>
            </div>
            <div className="dashboard-pulse-table">
              <div className="dashboard-pulse-header" aria-hidden="true">
                <span>Öğrenci</span>
                <span>Program</span>
                <span>Pratik</span>
                <span>Değişim</span>
                <span>Refleksiyon tonu ve durum</span>
              </div>
              {data.studentPulse.map((student) => (
                <a key={student.id} href={`/students/${student.id}`}>
                  <span className="dashboard-student-name">
                    <strong>{name(student.fullName, student.id)}</strong>
                    <small>
                      {student.channel ?? 'Kanal yok'} ·{' '}
                      {student.lastInboundAt
                        ? new Date(student.lastInboundAt).toLocaleDateString('tr-TR')
                        : 'Mesaj yok'}
                    </small>
                  </span>
                  <span className="dashboard-schedule">
                    {student.schedule.length
                      ? student.schedule
                          .map((slot) => `${slot.localTime} · ${slot.durationMinutes} dk`)
                          .join(', ')
                      : 'Aktif plan yok'}
                  </span>
                  <span className="dashboard-rate">
                    <strong>%{student.completionRate}</strong>
                    <small>
                      {student.completed} tamam · {student.skipped} yapılamadı · {student.missed}{' '}
                      kaçırıldı{student.pending ? ` · ${student.pending} bekliyor` : ''}
                    </small>
                  </span>
                  <span>
                    <Trend value={student.trend} />
                    <small>Önceki %{student.previous.completionRate}</small>
                  </span>
                  <span className="dashboard-pulse-status">
                    {student.insight ? (
                      <>
                        <span
                          className={`dashboard-tone is-${student.insight.tone.toLocaleLowerCase('en-US')}`}
                        >
                          {toneLabels[student.insight.tone]} · %
                          {Math.round(student.insight.confidence * 100)}
                        </span>
                        <small>
                          {student.insight.summary ?? actionLabels[student.insight.suggestedAction]}
                        </small>
                        {student.insight.safetyConcern ? (
                          <em className="is-safety">Güvenlik açısından görüşmede ele alın.</em>
                        ) : null}
                        {student.insight.coachTopics[0] ? (
                          <em>Görüşme: {student.insight.coachTopics[0]}</em>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span className="dashboard-tone is-empty">Analiz yok</span>
                        <small>
                          {student.reflections
                            ? 'Günlük analiz henüz hazırlanmadı.'
                            : 'Yeterli refleksiyon bulunmuyor.'}
                        </small>
                      </>
                    )}
                    {student.recommendation ? (
                      <em>{student.recommendation}</em>
                    ) : student.openHandoffs ? (
                      <em>Admin yanıtı bekleniyor.</em>
                    ) : null}
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section className="metrics dashboard-metrics" aria-label="Günlük operasyon metrikleri">
            <Metric
              label="Yeni mesaj"
              value={data.counts.recentMessages}
              icon={MessageSquareText}
              detail="Son 24 saat"
            />
            <Metric
              label="Gönderilemeyen"
              value={data.counts.failedMessages}
              icon={AlertTriangle}
              detail="İnceleme gerekiyor"
            />
            <Metric
              label="Açık handover"
              value={data.counts.openHandoffs}
              icon={LifeBuoy}
              detail="Yanıt bekliyor"
            />
            <Metric
              label="Bugünkü görüşme"
              value={data.counts.todayMeetings}
              icon={CalendarDays}
              detail="Önümüzdeki 24 saat"
            />
            <Metric
              label="Aktif öğrenci"
              value={data.counts.activeStudents}
              icon={Activity}
              detail="Test profilleri hariç"
            />
          </section>

          <div className="dashboard-primary-grid">
            <section className="dashboard-panel dashboard-action-panel">
              <div className="dashboard-panel-heading">
                <div>
                  <span>GÜNLÜK TAKİP</span>
                  <h2>Son öğrenci mesajları</h2>
                </div>
                <a href="/conversations">
                  Tümünü aç <ArrowRight />
                </a>
              </div>
              {data.recentMessages.length ? (
                <div className="dashboard-feed">
                  {data.recentMessages.slice(0, 7).map((message) => (
                    <a
                      key={message.id}
                      href={
                        message.studentId ? `/conversations/${message.studentId}` : '/conversations'
                      }
                    >
                      <span className="dashboard-avatar" aria-hidden="true">
                        {message.fullName?.slice(0, 1).toLocaleUpperCase('tr-TR') ?? '?'}
                      </span>
                      <span>
                        <strong>{name(message.fullName, message.studentId)}</strong>
                        <p>{message.content ?? 'Metin içermeyen mesaj'}</p>
                        <small>
                          {sourceLabels[message.source]} · {message.channel} ·{' '}
                          {new Date(message.occurredAt).toLocaleString('tr-TR')}
                        </small>
                      </span>
                      <ArrowRight aria-hidden="true" />
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyState icon={MessageSquareText} title="Son 24 saatte yeni mesaj yok" />
              )}
            </section>

            <section className="dashboard-panel dashboard-attention-panel">
              <div className="dashboard-panel-heading">
                <div>
                  <span>AKSİYON GEREKENLER</span>
                  <h2>Operasyon kuyruğu</h2>
                </div>
                <a href="/operations">
                  Operasyonu aç <ArrowRight />
                </a>
              </div>
              {data.counts.paymentReviews ? (
                <a className="dashboard-attention-item" href="/payments">
                  <CircleDollarSign />
                  <span>
                    <strong>Ödeme incelemesi</strong>
                    <small>{data.counts.paymentReviews} ödeme bildirimi onay bekliyor.</small>
                  </span>
                  <Badge tone="warning">İncele</Badge>
                </a>
              ) : null}
              {data.handoffs.map((handoff) => (
                <a
                  className="dashboard-attention-item"
                  key={handoff.id}
                  href={`/students/${handoff.studentId}`}
                >
                  <LifeBuoy />
                  <span>
                    <strong>{name(handoff.fullName, handoff.studentId)}</strong>
                    <small>{handoff.reason}</small>
                  </span>
                  <Badge tone="warning">Yanıt bekliyor</Badge>
                </a>
              ))}
              {data.failedMessages.slice(0, 5).map((message) => (
                <a className="dashboard-attention-item" key={message.id} href="/operations">
                  <AlertTriangle />
                  <span>
                    <strong>{name(message.fullName, message.studentId)}</strong>
                    <small>{categoryLabels[message.category] ?? message.category}</small>
                    {message.preview ? <p>{message.preview}</p> : null}
                    <em>
                      {reasonLabels[message.reason ?? ''] ??
                        message.reason ??
                        'Provider gönderimi başarısız.'}
                    </em>
                  </span>
                  <Badge tone={message.status === 'FAILED' ? 'danger' : 'neutral'}>
                    {message.status === 'FAILED' ? 'Başarısız' : 'Gönderilmedi'}
                  </Badge>
                </a>
              ))}
              {!data.counts.paymentReviews &&
              !data.handoffs.length &&
              !data.failedMessages.length ? (
                <EmptyState icon={CheckCircle2} title="Aksiyon kuyruğu temiz" />
              ) : null}
            </section>
          </div>

          <section className="dashboard-panel dashboard-meetings-panel dashboard-meetings-wide">
            <div className="dashboard-panel-heading">
              <div>
                <span>BUGÜN</span>
                <h2>Görüşmeler</h2>
              </div>
              <a href="/meetings">
                Takvimi aç <ArrowRight />
              </a>
            </div>
            {data.meetings.length ? (
              data.meetings.map((meeting) => (
                <a key={meeting.id} href={`/students/${meeting.studentId}`}>
                  <span className="dashboard-meeting-time">
                    <Clock3 />
                    <strong>
                      {new Date(meeting.startsAt).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>
                  </span>
                  <span>
                    <strong>{name(meeting.fullName, meeting.studentId)}</strong>
                    <small>{meeting.status === 'SCHEDULED' ? 'Planlandı' : meeting.status}</small>
                  </span>
                  <ArrowRight />
                </a>
              ))
            ) : (
              <EmptyState icon={CalendarDays} title="Bugün görüşme yok" />
            )}
          </section>
        </>
      )}
    </main>
  );
}

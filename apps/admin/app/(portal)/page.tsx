'use client';

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  LifeBuoy,
  MessageSquareText,
  Minus,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { Alert, Button, EmptyState, Modal, Skeleton } from '@meditation/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type Comparison = {
  completed: number;
  skipped: number;
  missed: number;
  pending?: number;
  completedMinutes?: number;
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
  dailyCheckIns: {
    responded: number;
    reflections: number;
    unanswered: number;
    students: Array<{
      studentId: string;
      fullName?: string;
      channel?: string;
      responded: number;
      reflections: number;
      unanswered: number;
    }>;
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
    nonCompletionStreak: number;
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

function formatMeditationDuration(minutes: number) {
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} sa ${remainder} dk` : `${hours} sa`;
}

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

type TodayFlowItem = {
  id: string;
  occurredAt: string;
  title: string;
  description: string;
  action: string;
  href: string;
  tone: 'standard' | 'attention' | 'urgent';
  icon: LucideIcon;
};

function dateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function flowTime(value: string, reference: string) {
  const date = new Date(value);
  if (dateKey(value) === dateKey(reference)) {
    return date.toLocaleTimeString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scheduleText(schedule: DashboardData['studentPulse'][number]['schedule']) {
  if (!schedule.length) return 'Aktif plan yok';
  return schedule.map((slot) => `${slot.localTime} · ${slot.durationMinutes} dk`).join(' / ');
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
  const [selectedPulse, setSelectedPulse] = useState<DashboardData['studentPulse'][number]>();

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

  const todayFlow = useMemo<TodayFlowItem[]>(() => {
    if (!data) return [];
    const checkInAlerts = data.studentPulse.filter((student) => student.nonCompletionStreak >= 3);
    const items: TodayFlowItem[] = [
      ...data.meetings.map<TodayFlowItem>((meeting) => ({
        id: `meeting-${meeting.id}`,
        occurredAt: meeting.startsAt,
        title: `${name(meeting.fullName, meeting.studentId)} · birebir görüşme`,
        description:
          meeting.status === 'SCHEDULED'
            ? 'Görüşme planlandı ve öğrenci kaydı hazır.'
            : `Görüşme durumu: ${meeting.status}`,
        action: 'Görüşmeyi aç',
        href: `/students/${meeting.studentId}`,
        tone: 'attention',
        icon: CalendarDays,
      })),
      ...checkInAlerts.map<TodayFlowItem>((student) => {
        return {
          id: `check-in-alert-${student.id}`,
          occurredAt: data.generatedAt,
          title: `${name(student.fullName, student.id)} · check-in takibi`,
          description: `Sonuçlanan son ${student.nonCompletionStreak} pratik üst üste tamamlanmadı.`,
          action: 'Öğrenciyi aç',
          href: `/students/${student.id}`,
          tone: 'urgent',
          icon: AlertTriangle,
        };
      }),
      ...data.recentMessages
        .filter((message) => dateKey(message.occurredAt) === dateKey(data.generatedAt))
        .slice(0, 3)
        .map<TodayFlowItem>((message) => ({
          id: `message-${message.id}`,
          occurredAt: message.occurredAt,
          title: `${name(message.fullName, message.studentId)} mesaj gönderdi`,
          description: message.content ?? 'Metin içermeyen mesaj',
          action: 'Konuşmayı aç',
          href: message.studentId ? `/conversations/${message.studentId}` : '/conversations',
          tone: 'standard',
          icon: MessageSquareText,
        })),
    ];

    return items.sort(
      (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
    );
  }, [data]);

  const checkInAlertCount =
    data?.studentPulse.filter((student) => student.nonCompletionStreak >= 3).length ?? 0;
  const attentionCount = data
    ? data.counts.paymentReviews +
      data.counts.openHandoffs +
      data.counts.failedMessages +
      checkInAlertCount
    : 0;

  return (
    <main className="content dashboard-page studio-dashboard">
      <header className="studio-dashboard-intro">
        <div>
          <span>
            {new Intl.DateTimeFormat('tr-TR', {
              timeZone: 'Europe/Istanbul',
              weekday: 'long',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(data?.generatedAt ?? Date.now()))}
          </span>
          <h1>
            {attentionCount
              ? `Bugünün ritminde ${attentionCount} konu dikkat istiyor.`
              : 'Bugünün ritmi sakin ve düzenli ilerliyor.'}
          </h1>
          <p>Pratik düzeni, öğrenci mesajları ve yaklaşan görüşmeler tek çalışma yüzeyinde.</p>
        </div>
        <Button
          variant="secondary"
          size="icon"
          title="Verileri yenile"
          aria-label="Verileri yenile"
          disabled={refreshing}
          onClick={() => void load()}
        >
          <RefreshCw className={refreshing ? 'ui-spinner' : undefined} />
        </Button>
      </header>

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
          <p className="studio-dashboard-updated">
            Son güncelleme {new Date(data.generatedAt).toLocaleString('tr-TR')}
          </p>

          <section className="studio-pulse" aria-label="Son yedi tam gün pratik özeti">
            <article>
              <span>Tamamlama</span>
              <strong>%{data.practice.completionRate}</strong>
              <small>Önceki %{data.practice.previous.completionRate}</small>
              <Trend value={data.practice.deltas.completionRate} />
            </article>
            <article>
              <span>Refleksiyon</span>
              <strong>%{data.practice.reflectionRate}</strong>
              <small>Önceki %{data.practice.previous.reflectionRate}</small>
              <Trend value={data.practice.deltas.reflectionRate} />
            </article>
            <article>
              <span>Tamamlanan pratik</span>
              <strong>{data.practice.completed}</strong>
              <small>Önceki {data.practice.previous.completed}</small>
            </article>
            <article>
              <span>Meditasyon süresi</span>
              <strong>{formatMeditationDuration(data.practice.completedMinutes ?? 0)}</strong>
              <small>
                Önceki {formatMeditationDuration(data.practice.previous.completedMinutes ?? 0)}
              </small>
            </article>
          </section>

          <section className="studio-desk">
            <div className="studio-desk-main">
              <section className="studio-practice-chart">
                <header className="studio-practice-chart-heading">
                  <div>
                    <span>PRATİK TAKİBİ · SON 7 TAM GÜN</span>
                    <h2>Haftalık pratik dağılımı</h2>
                    <p>Günlük sonuçlar ve sabah-akşam devamlılığı</p>
                  </div>
                  <Trend value={data.practice.deltas.completionRate} />
                </header>
                <div className="dashboard-chart-legend" aria-label="Pratik sonucu renkleri">
                  <span>
                    <i className="is-completed" /> Tamamlandı
                  </span>
                  <span>
                    <i className="is-skipped" /> Yapılamadı
                  </span>
                  <span>
                    <i className="is-missed" /> Kaçırıldı
                  </span>
                  <span>
                    <i className="is-pending" /> Henüz sonuçlanmadı
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

              <div className="studio-signal-legend" aria-label="Öğrenci durum renkleri">
                <span>
                  <i className="is-keep" /> Planı koru
                </span>
                <span>
                  <i className="is-discuss" /> Görüşmede ele al
                </span>
                <span>
                  <i className="is-simplify" /> Sadeleştirmeyi değerlendir
                </span>
              </div>

              <header className="studio-section-heading">
                <div>
                  <span>01</span>
                  <div>
                    <h2>Öğrenci ritmi</h2>
                    <p>Son yedi gün ve önceki haftaya göre değişim</p>
                  </div>
                </div>
                <a href="/students">
                  Tüm öğrenciler <ArrowRight />
                </a>
              </header>
              <div className="studio-student-table-head" aria-hidden="true">
                <span>Öğrenci</span>
                <span>Pratik</span>
                <span>Değişim</span>
                <span>Durum</span>
                <span />
              </div>
              <div className="studio-student-list">
                {data.studentPulse.slice(0, 8).map((student) => {
                  const suggestedAction = student.insight?.suggestedAction;
                  const action = suggestedAction
                    ? actionLabels[suggestedAction]
                    : student.openHandoffs
                      ? 'Görüşmede ele al'
                      : 'Analiz hazırlanıyor';
                  const signal =
                    suggestedAction?.toLocaleLowerCase('en-US') ??
                    (student.openHandoffs ? 'discuss' : 'empty');
                  return (
                    <button
                      className="studio-student-row"
                      type="button"
                      key={student.id}
                      aria-label={`${name(student.fullName, student.id)}: ${action}`}
                      onClick={() => {
                        if (student.insight) setSelectedPulse(student);
                        else window.location.href = `/students/${student.id}`;
                      }}
                    >
                      <span className="studio-student-identity">
                        <i>{student.fullName?.slice(0, 1).toLocaleUpperCase('tr-TR') ?? '?'}</i>
                        <span>
                          <strong>{name(student.fullName, student.id)}</strong>
                          <small>
                            {student.channel ?? 'Kanal yok'} · {scheduleText(student.schedule)}
                          </small>
                        </span>
                      </span>
                      <span className="studio-student-rhythm">
                        <strong>%{student.completionRate}</strong>
                        <small>
                          {student.completed} tamam · {student.skipped} yapılamadı ·{' '}
                          {student.missed} kaçırıldı
                        </small>
                      </span>
                      <span className="studio-student-trend">
                        <Trend value={student.trend} />
                        <small>Önceki %{student.previous.completionRate}</small>
                      </span>
                      <span className={`studio-student-signal is-${signal}`}>
                        <i /> {action}
                      </span>
                      <ArrowRight aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="studio-today-flow">
              <header className="studio-section-heading">
                <div>
                  <span>02</span>
                  <div>
                    <h2>Bugünün akışı</h2>
                    <p>Gerçek zamanlı görüşme ve operasyon akışı</p>
                  </div>
                </div>
              </header>
              {todayFlow.length ? (
                <div className="studio-timeline">
                  {todayFlow.map((item) => {
                    const Icon = item.icon;
                    return (
                      <article className={`studio-flow-item is-${item.tone}`} key={item.id}>
                        <span className="studio-flow-icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <div>
                          <time>{flowTime(item.occurredAt, data.generatedAt)}</time>
                          <strong>{item.title}</strong>
                          <p>{item.description}</p>
                          <a href={item.href}>{item.action}</a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={CheckCircle2}
                  title="Bugünün akışı sakin"
                  description="Bekleyen görüşme veya operasyon bulunmuyor."
                />
              )}
              <section className="studio-daily-checkins" aria-labelledby="daily-checkin-title">
                <header>
                  <div>
                    <span>BUGÜN</span>
                    <h3 id="daily-checkin-title">Check-in ve refleksiyon</h3>
                  </div>
                  <strong>{data.dailyCheckIns.responded} yanıt</strong>
                </header>
                <p className="studio-daily-checkin-summary">
                  {data.dailyCheckIns.reflections} refleksiyon · {data.dailyCheckIns.unanswered}{' '}
                  yanıt bekliyor
                </p>
                {data.dailyCheckIns.students.length ? (
                  <div className="studio-daily-checkin-list">
                    {data.dailyCheckIns.students.map((student) => {
                      const tone = student.unanswered
                        ? 'waiting'
                        : student.reflections
                          ? 'reflected'
                          : 'responded';
                      const details = [
                        student.responded ? `${student.responded} check-in` : undefined,
                        student.reflections ? `${student.reflections} refleksiyon` : undefined,
                        student.unanswered ? `${student.unanswered} yanıt bekliyor` : undefined,
                      ].filter(Boolean);
                      return (
                        <a href={`/students/${student.studentId}`} key={student.studentId}>
                          <i className={`is-${tone}`} aria-hidden="true" />
                          <span>
                            <strong>{name(student.fullName, student.studentId)}</strong>
                            <small>{details.join(' · ')}</small>
                          </span>
                          <ArrowRight aria-hidden="true" />
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <p className="studio-daily-checkin-empty">
                    Bugün sonuçlanan veya yanıt bekleyen check-in yok.
                  </p>
                )}
              </section>
            </aside>
          </section>

          <section className="studio-lower-grid">
            <div className="studio-lower-section">
              <header className="studio-section-heading">
                <div>
                  <span>03</span>
                  <div>
                    <h2>Dikkat isteyenler</h2>
                    <p>Aksiyon gereken işler ve bugünün gönderim görünümü</p>
                  </div>
                </div>
                <a href="/operations">
                  Operasyonu aç <ArrowRight />
                </a>
              </header>
              {data.counts.paymentReviews ? (
                <a className="studio-attention-row" href="/payments">
                  <CircleDollarSign />
                  <span>
                    <strong>Ödeme incelemesi</strong>
                    <small>{data.counts.paymentReviews} ödeme bildirimi onay bekliyor.</small>
                  </span>
                  <em>Bugün</em>
                </a>
              ) : null}
              {data.handoffs.slice(0, 3).map((handoff) => (
                <a
                  className="studio-attention-row"
                  key={handoff.id}
                  href={`/students/${handoff.studentId}`}
                >
                  <LifeBuoy />
                  <span>
                    <strong>{name(handoff.fullName, handoff.studentId)}</strong>
                    <small>{handoff.reason}</small>
                  </span>
                  <em>Yanıt bekliyor</em>
                </a>
              ))}
              {data.failedMessages.length ? (
                <div className="studio-delivery-heading">
                  <strong>Bugünkü gönderim sorunları</strong>
                  <small>Bilgi amaçlı · gün değişince listeden kalkar</small>
                </div>
              ) : null}
              {data.failedMessages.slice(0, 4).map((message) => (
                <div className="studio-attention-row is-failed is-informational" key={message.id}>
                  <AlertTriangle />
                  <span>
                    <strong>
                      {name(message.fullName, message.studentId)} ·{' '}
                      {categoryLabels[message.category] ?? message.category}
                    </strong>
                    {message.preview ? <p>{message.preview}</p> : null}
                    <small>
                      {reasonLabels[message.reason ?? ''] ??
                        message.reason ??
                        'Provider gönderimi başarısız.'}
                    </small>
                  </span>
                  <em>{message.status === 'FAILED' ? 'Başarısız' : 'Gönderilmedi'}</em>
                </div>
              ))}
              {!data.counts.paymentReviews &&
              !data.handoffs.length &&
              !data.failedMessages.length ? (
                <EmptyState icon={CheckCircle2} title="Aksiyon kuyruğu temiz" />
              ) : null}
            </div>

            <div className="studio-lower-section">
              <header className="studio-section-heading">
                <div>
                  <span>04</span>
                  <div>
                    <h2>İçerik etkisi</h2>
                    <p>Son yedi gün</p>
                  </div>
                </div>
                <a href="/readings">
                  Detaylar <ArrowRight />
                </a>
              </header>
              <a className="studio-content-stat" href="/readings">
                <span>
                  <strong>Atanan okumalar</strong>
                  <small>{data.content.assignments.OPENED ?? 0} okunuyor</small>
                </span>
                <b>{data.content.assignments.COMPLETED ?? 0}</b>
              </a>
              <a className="studio-content-stat" href="/readings">
                <span>
                  <strong>Global okuma</strong>
                  <small>
                    {data.content.readings.visitors} tekil ziyaret ·{' '}
                    {data.content.readings.whatsappClicks} WhatsApp
                  </small>
                </span>
                <b>{data.content.readings.views}</b>
              </a>
              <a className="studio-content-stat" href="/meditations">
                <span>
                  <strong>Global meditasyon</strong>
                  <small>
                    {data.content.meditations.completions} tamamlama ·{' '}
                    {data.content.meditations.ctaClicks} ilgi sinyali
                  </small>
                </span>
                <b>{data.content.meditations.starts}</b>
              </a>
            </div>
          </section>

          <section className="studio-messages">
            <header className="studio-section-heading">
              <div>
                <span>05</span>
                <div>
                  <h2>Son öğrenci mesajları</h2>
                  <p>Günlük iletişim akışının son kayıtları</p>
                </div>
              </div>
              <a href="/conversations">
                Tümünü aç <ArrowRight />
              </a>
            </header>
            {data.recentMessages.length ? (
              <div className="studio-message-list">
                {data.recentMessages.slice(0, 7).map((message) => (
                  <a
                    key={message.id}
                    href={
                      message.studentId ? `/conversations/${message.studentId}` : '/conversations'
                    }
                  >
                    <span className="studio-message-avatar">
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
        </>
      )}

      {selectedPulse?.insight ? (
        <Modal
          title={`${name(selectedPulse.fullName, selectedPulse.id)} · Haftalık analiz`}
          description={`Son 7 tam gün · ${new Date(selectedPulse.insight.generatedAt).toLocaleString('tr-TR')}`}
          onClose={() => setSelectedPulse(undefined)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setSelectedPulse(undefined)}>
                Kapat
              </Button>
              <Button onClick={() => (window.location.href = `/students/${selectedPulse.id}`)}>
                Öğrenciyi aç
              </Button>
            </>
          }
        >
          <div className="dashboard-pulse-modal">
            <span
              className={`dashboard-action is-${selectedPulse.insight.suggestedAction.toLocaleLowerCase('en-US')}`}
            >
              {actionLabels[selectedPulse.insight.suggestedAction]}
            </span>
            <section>
              <h3>Genel değerlendirme</h3>
              <p>{selectedPulse.insight.summary}</p>
            </section>
            <div className="dashboard-pulse-modal-grid">
              <section>
                <h3>Güçlü sinyaller</h3>
                {selectedPulse.insight.strengths.length ? (
                  <ul>
                    {selectedPulse.insight.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Belirgin bir güçlü sinyal bulunmuyor.</p>
                )}
              </section>
              <section>
                <h3>Takip konuları</h3>
                {selectedPulse.insight.challenges.length ? (
                  <ul>
                    {selectedPulse.insight.challenges.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Ek takip gerektiren bir konu bulunmuyor.</p>
                )}
              </section>
            </div>
            <section>
              <h3>Görüşmede ele alınabilecekler</h3>
              {selectedPulse.insight.coachTopics.length ? (
                <ul>
                  {selectedPulse.insight.coachTopics.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>Özel bir görüşme gündemi bulunmuyor.</p>
              )}
            </section>
            {selectedPulse.recommendation ? (
              <Alert tone="info" title="Program önerisi">
                {selectedPulse.recommendation}
              </Alert>
            ) : null}
            {selectedPulse.insight.safetyConcern ? (
              <Alert tone="danger" title="Öncelikli değerlendirme">
                Güvenlik açısından görüşmede öncelikli olarak ele alın.
              </Alert>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

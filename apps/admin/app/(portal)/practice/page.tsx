'use client';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  Skeleton,
  TextField,
  Toast,
} from '@meditation/ui';
import {
  Ban,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Pause,
  PencilLine,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Timer,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  allPracticeWeekdays,
  PracticeWeekdaySelector,
} from '../../_components/practice-weekday-selector';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type Session = {
  id: string;
  studentId: string;
  studentName?: string;
  status: string;
  version: number;
  startAt: string;
  durationMinutes: number;
  slot?: string;
  localTime?: string;
  planRevision: number;
  cancellationReason?: string;
  reflection?: {
    content?: string;
    createdAt: string;
    tags: Array<{ tag: string; confidence: number }>;
  };
  reflectionTags?: Array<{ tag: string; confidence: number }>;
};
type Plan = {
  id: string;
  subscriptionPeriodId: string;
  status: string;
  revision: number;
  activeWeekdays: number[];
  slots: Array<{
    slotKey: string;
    localTime: string;
    active: boolean;
    durationMinutes: number;
    meditationType?: { id: string; title: string };
  }>;
};
type StudentOption = { id: string; fullName?: string; status: string };

const statusLabels: Record<string, string> = {
  COMPLETED: 'Tamamlandı',
  SKIPPED: 'Yapılamadı',
  MISSED: 'Dönüş alınmadı',
  CANCELLED: 'İptal edildi',
  REMINDED: 'Hatırlatıldı',
  AWAITING_RESPONSE: 'Yanıt bekleniyor',
  SCHEDULED: 'Planlandı',
};
function studentLabel(session: Session) {
  return session.studentName ?? `İsimsiz öğrenci · ${session.studentId.slice(0, 8)}`;
}
function studentInitials(session: Session) {
  if (!session.studentName?.trim()) return '?';
  const parts = session.studentName.trim().split(/\s+/u);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''}`.toLocaleUpperCase(
    'tr-TR',
  );
}
function slotLabel(slot?: string) {
  return slot === 'MORNING' ? 'Sabah' : slot === 'EVENING' ? 'Akşam' : 'Pratik';
}
function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function startOfWeek(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  const startText = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(
    start,
  );
  const endText = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(end);
  return `${startText} – ${endText}`;
}

function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} sa${remainder ? ` ${remainder} dk` : ''}`;
}

export default function PracticePage() {
  const [sessions, setSessions] = useState<Session[]>();
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [selected, setSelected] = useState<Session>();
  const [workspace, setWorkspace] = useState<'SESSIONS' | 'PROGRAM'>('SESSIONS');
  const [filter, setFilter] = useState<'HISTORY' | 'PLANNED' | 'CANCELLED'>('HISTORY');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<Plan>();
  const [subscriptionId, setSubscriptionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [practiceDialog, setPracticeDialog] = useState<'reschedule' | 'cancel' | 'restore'>();
  const [practiceDate, setPracticeDate] = useState('');
  const [practiceReason, setPracticeReason] = useState('');
  const [practiceOutcomeOpen, setPracticeOutcomeOpen] = useState(false);
  const [practiceOutcome, setPracticeOutcome] = useState<'COMPLETED' | 'SKIPPED' | 'MISSED'>(
    'COMPLETED',
  );
  const [practiceReflection, setPracticeReflection] = useState('');
  const [practiceOutcomeReason, setPracticeOutcomeReason] = useState('');
  const [activeWeekdays, setActiveWeekdays] = useState<number[]>([...allPracticeWeekdays]);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [sessionsResponse, studentsResponse] = await Promise.all([
        fetch(`${api}/v1/admin/practice-sessions`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch(`${api}/v1/admin/students`, { credentials: 'include', cache: 'no-store' }),
      ]);
      if (!sessionsResponse.ok || !studentsResponse.ok)
        throw new Error(`HTTP ${sessionsResponse.status}/${studentsResponse.status}`);
      setSessions(((await sessionsResponse.json()) as { items: Session[] }).items);
      setStudentOptions(
        ((await studentsResponse.json()) as { items: StudentOption[] }).items.sort((a, b) =>
          (a.fullName ?? a.id).localeCompare(b.fullName ?? b.id, 'tr-TR'),
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pratikler yüklenemedi.');
    }
  }, []);
  useEffect(() => void load(), [load]);

  const counts = useMemo(() => {
    const items = sessions ?? [];
    return {
      completed: items.filter((item) => item.status === 'COMPLETED').length,
      incomplete: items.filter((item) => ['MISSED', 'SKIPPED'].includes(item.status)).length,
      planned: items.filter(
        (item) =>
          ['SCHEDULED', 'REMINDED'].includes(item.status) &&
          new Date(item.startAt).getTime() >= Date.now(),
      ).length,
      awaiting: items.filter((item) => item.status === 'AWAITING_RESPONSE').length,
      cancelled: items.filter((item) => item.status === 'CANCELLED').length,
    };
  }, [sessions]);

  const weeklyOverview = useMemo(() => {
    const items = sessions ?? [];
    const currentWeek = startOfWeek(new Date());
    const weeks = Array.from({ length: 6 }, (_, index) => {
      const start = addDays(currentWeek, (index - 5) * 7);
      const end = addDays(start, 7);
      const completedSessions = items.filter((item) => {
        const timestamp = new Date(item.startAt).getTime();
        return (
          item.status === 'COMPLETED' && timestamp >= start.getTime() && timestamp < end.getTime()
        );
      });
      return {
        start,
        completed: completedSessions.length,
        minutes: completedSessions.reduce((sum, item) => sum + item.durationMinutes, 0),
      };
    });
    const current = weeks.at(-1)!;
    const previous = weeks.at(-2)!;
    const currentEnd = addDays(currentWeek, 7);
    const currentItems = items.filter((item) => {
      const timestamp = new Date(item.startAt).getTime();
      return timestamp >= currentWeek.getTime() && timestamp < currentEnd.getTime();
    });
    return {
      weeks,
      current,
      change: current.completed - previous.completed,
      incomplete: currentItems.filter((item) => ['MISSED', 'SKIPPED'].includes(item.status)).length,
      awaiting: items.filter((item) => item.status === 'AWAITING_RESPONSE').length,
      maximum: Math.max(1, ...weeks.map((week) => week.completed)),
    };
  }, [sessions]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    const items = (sessions ?? []).filter(
      (item) =>
        !query ||
        studentLabel(item).toLocaleLowerCase('tr-TR').includes(query) ||
        item.studentId.toLowerCase().includes(query),
    );
    if (filter === 'PLANNED')
      return items
        .filter(
          (item) =>
            ['SCHEDULED', 'REMINDED'].includes(item.status) &&
            new Date(item.startAt).getTime() >= Date.now(),
        )
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    if (filter === 'CANCELLED')
      return items
        .filter((item) => item.status === 'CANCELLED')
        .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
    return items
      .filter((item) =>
        ['COMPLETED', 'MISSED', 'SKIPPED', 'AWAITING_RESPONSE'].includes(item.status),
      )
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [sessions, filter, search]);

  useEffect(() => {
    if (selected && !visible.some((item) => item.id === selected.id)) setSelected(undefined);
  }, [selected, visible]);

  async function request(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    try {
      const response = await fetch(`${api}/v1/${path}`, {
        method,
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
        },
        body: JSON.stringify(body),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error((value as { message?: string }).message ?? `HTTP ${response.status}`);
      setNotice('İşlem kaydedildi.');
      await load();
      return value;
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function loadPlanFor(id: string) {
    if (!id) return;
    setBusy(true);
    try {
      const response = await fetch(`${api}/v1/admin/students/${id}/practice-plan`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = (await response.json()) as {
        plan: Plan | null;
        subscriptions: Array<{ id: string; status: string }>;
      };
      setStudentId(id);
      setPlan(value.plan ?? undefined);
      setActiveWeekdays(value.plan?.activeWeekdays ?? [...allPracticeWeekdays]);
      setSubscriptionId(value.plan?.subscriptionPeriodId ?? value.subscriptions[0]?.id ?? '');
      if (!value.plan) setNotice('Bu öğrenci için aktif pratik planı bulunmuyor.');
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Plan yüklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  function openSession(session: Session) {
    setSelected((current) => (current?.id === session.id ? undefined : session));
  }
  function openPracticeDialog(action: 'reschedule' | 'cancel' | 'restore') {
    if (!selected) return;
    setPracticeDialog(action);
    setPracticeDate(action === 'reschedule' ? toLocalDateTime(selected.startAt) : '');
    setPracticeReason(
      action === 'cancel'
        ? 'Öğrenci programına göre iptal edildi.'
        : action === 'restore'
          ? 'İptal geri alındı.'
          : 'Öğrenci programına göre güncellendi.',
    );
  }
  async function submitPracticeDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !practiceDialog || !practiceReason.trim()) return;
    const path =
      practiceDialog === 'reschedule'
        ? `admin/practice-sessions/${selected.id}`
        : `admin/practice-sessions/${selected.id}/${practiceDialog}`;
    await request(
      path,
      practiceDialog === 'reschedule'
        ? {
            startAt: new Date(practiceDate).toISOString(),
            expectedVersion: selected.version,
            reason: practiceReason.trim(),
          }
        : { reason: practiceReason.trim() },
      practiceDialog === 'reschedule' ? 'PATCH' : 'POST',
    );
    setPracticeDialog(undefined);
    setSelected(undefined);
  }
  function openPracticeOutcome(session: Session) {
    setSelected(session);
    setPracticeOutcome(
      ['COMPLETED', 'SKIPPED', 'MISSED'].includes(session.status)
        ? (session.status as 'COMPLETED' | 'SKIPPED' | 'MISSED')
        : 'COMPLETED',
    );
    setPracticeReflection(session.reflection?.content ?? '');
    setPracticeOutcomeReason('Pratik kaydı admin tarafından güncellendi.');
    setPracticeOutcomeOpen(true);
  }
  async function submitPracticeOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !practiceOutcomeReason.trim()) return;
    const result = await request(
      `admin/practice-sessions/${selected.id}/outcome`,
      {
        status: practiceOutcome,
        expectedVersion: selected.version,
        reflection: practiceOutcome === 'COMPLETED' ? practiceReflection.trim() || null : undefined,
        reason: practiceOutcomeReason.trim(),
      },
      'PATCH',
    );
    if (result) {
      setPracticeOutcomeOpen(false);
      setSelected(undefined);
      setPracticeReflection('');
    }
  }
  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscriptionId || !studentId) return;
    const form = new FormData(event.currentTarget);
    await request(`admin/students/${studentId}/practice-plan/versions`, {
      subscriptionId,
      slots: [
        {
          slotKey: 'MORNING',
          localTime: form.get('morning'),
          active: form.get('morningActive') === 'on',
          durationMinutes: Number(form.get('morningDuration')),
          meditationTypeId:
            plan?.slots.find((slot) => slot.slotKey === 'MORNING')?.meditationType?.id ?? null,
        },
        {
          slotKey: 'EVENING',
          localTime: form.get('evening'),
          active: form.get('eveningActive') === 'on',
          durationMinutes: Number(form.get('eveningDuration')),
          meditationTypeId:
            plan?.slots.find((slot) => slot.slotKey === 'EVENING')?.meditationType?.id ?? null,
        },
      ],
      activeWeekdays,
    });
    await loadPlanFor(studentId);
  }
  async function togglePlan() {
    if (!plan) return;
    await request(`admin/students/${studentId}/practice/pause`, {
      paused: plan.status !== 'PAUSED',
      reason: plan.status === 'PAUSED' ? 'Admin devam ettirdi' : 'Admin durdurdu',
    });
    await loadPlanFor(studentId);
  }

  return (
    <main className="content">
      <PageHeader
        title="Pratikler"
        description="Oturum sonuçlarını izleyin ve öğrenci programlarını yönetin"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" /> Yenile
          </Button>
        }
      />
      {notice ? (
        <Toast tone="info" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Toast>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!sessions ? (
        <Skeleton />
      ) : (
        <>
          <section className="practice-overview" aria-labelledby="practice-overview-title">
            <header className="practice-overview-head">
              <div>
                <span className="eyebrow">Haftalık görünüm</span>
                <h2 id="practice-overview-title">
                  {formatWeekRange(weeklyOverview.current.start)}
                </h2>
              </div>
              <span className="practice-overview-legend">
                <i aria-hidden="true" /> Tamamlanan pratik
              </span>
            </header>
            <div className="practice-overview-body">
              <div className="practice-weekly-kpis">
                <article>
                  <CheckCircle2 aria-hidden="true" />
                  <span>
                    <small>Bu hafta tamamlandı</small>
                    <strong>{weeklyOverview.current.completed}</strong>
                    <em data-tone={weeklyOverview.change < 0 ? 'down' : 'up'}>
                      {weeklyOverview.change === 0
                        ? 'Geçen haftayla aynı'
                        : `Geçen haftaya göre ${weeklyOverview.change > 0 ? '+' : ''}${weeklyOverview.change}`}
                    </em>
                  </span>
                </article>
                <article>
                  <XCircle aria-hidden="true" />
                  <span>
                    <small>Bu hafta tamamlanmadı</small>
                    <strong>{weeklyOverview.incomplete}</strong>
                    <em>Yapılamadı veya dönüş alınmadı</em>
                  </span>
                </article>
                <article>
                  <Timer aria-hidden="true" />
                  <span>
                    <small>Meditasyon süresi</small>
                    <strong>{formatMinutes(weeklyOverview.current.minutes)}</strong>
                    <em>Tamamlanan pratiklerin toplamı</em>
                  </span>
                </article>
                <article>
                  <History aria-hidden="true" />
                  <span>
                    <small>Yanıt bekleyen</small>
                    <strong>{weeklyOverview.awaiting}</strong>
                    <em>Kontrol edilmesi gereken oturum</em>
                  </span>
                </article>
              </div>
              <div className="practice-weekly-chart">
                <div className="practice-weekly-chart-title">
                  <BarChart3 aria-hidden="true" />
                  <span>
                    <strong>Son 6 hafta</strong>
                    <small>Tamamlanan pratik sayısı</small>
                  </span>
                </div>
                <div className="practice-week-bars">
                  {weeklyOverview.weeks.map((week, index) => (
                    <article key={week.start.toISOString()} data-current={index === 5}>
                      <strong>{week.completed}</strong>
                      <span className="practice-week-track" aria-hidden="true">
                        <i
                          style={{
                            height: `${Math.max(5, (week.completed / weeklyOverview.maximum) * 100)}%`,
                          }}
                        />
                      </span>
                      <small>
                        {index === 5 ? 'Bu hafta' : formatWeekRange(week.start).split(' – ')[0]}
                      </small>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <nav className="workspace-tabs" aria-label="Pratik çalışma alanı">
            <button data-active={workspace === 'SESSIONS'} onClick={() => setWorkspace('SESSIONS')}>
              <History aria-hidden="true" /> Oturumlar
            </button>
            <button data-active={workspace === 'PROGRAM'} onClick={() => setWorkspace('PROGRAM')}>
              <Settings2 aria-hidden="true" /> Program düzenle
            </button>
          </nav>

          {workspace === 'SESSIONS' ? (
            <>
              <div className="practice-toolbar">
                <label className="practice-search">
                  <Search aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Öğrenci adıyla ara"
                  />
                </label>
                <div className="student-subtabs">
                  {[
                    [
                      'HISTORY',
                      'Oturum geçmişi',
                      counts.completed + counts.incomplete + counts.awaiting,
                    ],
                    ['PLANNED', 'Planlanan', counts.planned],
                    ['CANCELLED', 'İptal edilen', counts.cancelled],
                  ].map(([key, text, count]) => (
                    <button
                      key={String(key)}
                      data-active={filter === key}
                      onClick={() => setFilter(key as typeof filter)}
                    >
                      {text} <small>{count}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="practice-layout" data-has-selection={Boolean(selected)}>
                <section className="practice-table">
                  <div className="practice-table__head">
                    <span>Öğrenci</span>
                    <span>Tarih ve saat</span>
                    <span>Oturum</span>
                    <span>Durum</span>
                    <span />
                  </div>
                  {visible.length ? (
                    visible.map((item, index) => (
                      <button
                        className="practice-row"
                        data-selected={selected?.id === item.id}
                        key={item.id}
                        onClick={() => openSession(item)}
                      >
                        <span className="practice-student-cell">
                          <i className={index % 2 === 0 ? 'is-gold' : 'is-sage'}>
                            {studentInitials(item)}
                          </i>
                          <strong>{studentLabel(item)}</strong>
                        </span>
                        <span>{formatSessionDate(item.startAt)}</span>
                        <span>
                          {slotLabel(item.slot)} · {item.durationMinutes} dk
                        </span>
                        <span className="practice-status" data-status={item.status}>
                          {statusLabels[item.status] ?? item.status}
                        </span>
                        <ChevronRight aria-hidden="true" />
                      </button>
                    ))
                  ) : (
                    <EmptyState icon={Clock3} title="Bu görünümde pratik yok" />
                  )}
                </section>
                {selected ? (
                  <aside className="practice-detail">
                    <>
                      <header>
                        <div>
                          <small className="eyebrow">Seçili oturum</small>
                          <h2>{studentLabel(selected)}</h2>
                          <span className="practice-status" data-status={selected.status}>
                            {statusLabels[selected.status] ?? selected.status}
                          </span>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Oturum detayını kapat"
                          aria-label="Oturum detayını kapat"
                          onClick={() => setSelected(undefined)}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </header>
                      <dl className="practice-detail-list">
                        <div>
                          <dt>Zaman</dt>
                          <dd>{formatSessionDate(selected.startAt)}</dd>
                        </div>
                        <div>
                          <dt>Oturum</dt>
                          <dd>
                            {slotLabel(selected.slot)} · {selected.durationMinutes} dakika
                          </dd>
                        </div>
                        <div>
                          <dt>Plan revizyonu</dt>
                          <dd>v{selected.planRevision}</dd>
                        </div>
                      </dl>
                      {selected.reflection?.content ? (
                        <section className="practice-reflection">
                          <header>
                            <strong>Refleksiyon</strong>
                            <time>{formatSessionDate(selected.reflection.createdAt)}</time>
                          </header>
                          <p>{selected.reflection.content}</p>
                          {selected.reflection.tags.length ? (
                            <div>
                              {selected.reflection.tags.map((tag) => (
                                <span key={tag.tag}>{tag.tag}</span>
                              ))}
                            </div>
                          ) : null}
                        </section>
                      ) : null}
                      <a className="student-link" href={`/students/${selected.studentId}`}>
                        <UserRound aria-hidden="true" /> Öğrenci sayfasını aç
                      </a>
                      {!selected.reflection?.content && selected.reflectionTags?.length ? (
                        <div className="practice-tags">
                          <strong>Refleksiyon etiketleri</strong>
                          <div>
                            {selected.reflectionTags.map((tag) => (
                              <Badge key={tag.tag} tone="info">
                                {tag.tag} · %{Math.round(tag.confidence * 100)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {!['CANCELLED', 'SUPPRESSED'].includes(selected.status) &&
                      new Date(selected.startAt).getTime() <= Date.now() ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openPracticeOutcome(selected)}
                        >
                          <PencilLine aria-hidden="true" /> Durumu ve refleksiyonu düzenle
                        </Button>
                      ) : null}
                      {['SCHEDULED', 'REMINDED'].includes(selected.status) ? (
                        <div className="practice-detail-actions">
                          <Button
                            variant="secondary"
                            onClick={() => openPracticeDialog('reschedule')}
                          >
                            <Clock3 aria-hidden="true" /> Saati değiştir
                          </Button>
                          <Button variant="danger" onClick={() => openPracticeDialog('cancel')}>
                            <Ban aria-hidden="true" /> İptal et
                          </Button>
                        </div>
                      ) : null}
                      {selected.status === 'CANCELLED' ? (
                        <Button variant="secondary" onClick={() => openPracticeDialog('restore')}>
                          <Play aria-hidden="true" /> İptali geri al
                        </Button>
                      ) : null}
                    </>
                  </aside>
                ) : null}
              </div>
            </>
          ) : (
            <section className="practice-program-workspace">
              <div className="student-section-heading">
                <div>
                  <span className="eyebrow">ÖĞRENCİ PROGRAMI</span>
                  <h2>Günlük pratik planı</h2>
                  <p>Öğrenciyi seçin; sabah, akşam ve süre ayarlarını tek yerden yönetin.</p>
                </div>
              </div>
              <label className="ui-field practice-student-select">
                <span className="ui-field__label">Öğrenci</span>
                <select
                  value={studentId}
                  onChange={(event) => void loadPlanFor(event.target.value)}
                >
                  <option value="">Öğrenci seçin</option>
                  {studentOptions.map((student) => (
                    <option value={student.id} key={student.id}>
                      {student.fullName ?? `İsimsiz öğrenci · ${student.id.slice(0, 8)}`}
                      {student.status !== 'ACTIVE' ? ` · ${student.status}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {studentId && subscriptionId ? (
                <div className="plan-editor">
                  <div>
                    <Badge tone={plan?.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {plan?.status === 'PAUSED' ? 'Duraklatıldı' : plan ? 'Aktif' : 'Yeni plan'}
                    </Badge>
                    <strong>{plan ? `Revizyon ${plan.revision}` : 'İlk program'}</strong>
                  </div>
                  <form key={`${plan?.id ?? 'new'}:${plan?.revision ?? 0}`} onSubmit={createPlan}>
                    <label className="check-field">
                      <input
                        type="checkbox"
                        name="morningActive"
                        defaultChecked={
                          plan?.slots.some((slot) => slot.slotKey === 'MORNING' && slot.active) ??
                          true
                        }
                      />{' '}
                      Sabah aktif
                    </label>
                    <TextField
                      name="morning"
                      label="Sabah saati"
                      type="time"
                      defaultValue={
                        plan?.slots.find((slot) => slot.slotKey === 'MORNING')?.localTime ?? '08:00'
                      }
                    />
                    <TextField
                      name="morningDuration"
                      label="Sabah süresi (dk)"
                      type="number"
                      min="1"
                      max="180"
                      required
                      defaultValue={
                        plan?.slots.find((slot) => slot.slotKey === 'MORNING')?.durationMinutes ??
                        15
                      }
                    />
                    <label className="check-field">
                      <input
                        type="checkbox"
                        name="eveningActive"
                        defaultChecked={
                          plan?.slots.some((slot) => slot.slotKey === 'EVENING' && slot.active) ??
                          true
                        }
                      />{' '}
                      Akşam aktif
                    </label>
                    <TextField
                      name="evening"
                      label="Akşam saati"
                      type="time"
                      defaultValue={
                        plan?.slots.find((slot) => slot.slotKey === 'EVENING')?.localTime ?? '21:00'
                      }
                    />
                    <TextField
                      name="eveningDuration"
                      label="Akşam süresi (dk)"
                      type="number"
                      min="1"
                      max="180"
                      required
                      defaultValue={
                        plan?.slots.find((slot) => slot.slotKey === 'EVENING')?.durationMinutes ??
                        15
                      }
                    />
                    <PracticeWeekdaySelector
                      value={activeWeekdays}
                      onChange={setActiveWeekdays}
                      disabled={busy}
                    />
                    <Button type="submit" loading={busy}>
                      <CheckCircle2 aria-hidden="true" /> Yeni sürümü kaydet
                    </Button>
                  </form>
                  {plan && plan.status !== 'DRAFT' ? (
                    <Button variant="ghost" loading={busy} onClick={() => void togglePlan()}>
                      {plan.status === 'PAUSED' ? (
                        <Play aria-hidden="true" />
                      ) : (
                        <Pause aria-hidden="true" />
                      )}
                      {plan.status === 'PAUSED' ? 'Programı devam ettir' : 'Programı duraklat'}
                    </Button>
                  ) : null}
                </div>
              ) : studentId ? (
                <EmptyState
                  title="Aktif üyelik bulunamadı"
                  description="Program oluşturmak için aktif veya planlanmış paket gerekir."
                />
              ) : (
                <EmptyState
                  icon={UserRound}
                  title="Öğrenci seçin"
                  description="Program ayrıntıları burada açılacak."
                />
              )}
            </section>
          )}
        </>
      )}

      {practiceDialog ? (
        <Modal
          title={
            practiceDialog === 'reschedule'
              ? 'Pratik saatini değiştir'
              : practiceDialog === 'cancel'
                ? 'Pratiği iptal et'
                : 'İptali geri al'
          }
          description="Değişiklik yalnızca seçili oturuma uygulanır."
          onClose={() => setPracticeDialog(undefined)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setPracticeDialog(undefined)}>
                Vazgeç
              </Button>
              <Button form="practice-page-session-form" type="submit" loading={busy}>
                Kaydet
              </Button>
            </>
          }
        >
          <form
            id="practice-page-session-form"
            className="student-modal-form"
            onSubmit={submitPracticeDialog}
          >
            {practiceDialog === 'reschedule' ? (
              <label>
                <span>Yeni saat</span>
                <input
                  required
                  type="datetime-local"
                  value={practiceDate}
                  onChange={(event) => setPracticeDate(event.target.value)}
                />
              </label>
            ) : null}
            <label>
              <span>İşlem nedeni</span>
              <textarea
                required
                maxLength={500}
                value={practiceReason}
                onChange={(event) => setPracticeReason(event.target.value)}
              />
            </label>
          </form>
        </Modal>
      ) : null}

      {practiceOutcomeOpen && selected ? (
        <Modal
          title="Pratik kaydını düzenle"
          description="Pratik durumunu ve varsa öğrenci refleksiyonunu aynı kayıtta yönetin."
          onClose={() => setPracticeOutcomeOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setPracticeOutcomeOpen(false)}>
                Vazgeç
              </Button>
              <Button form="practice-outcome-form" type="submit" loading={busy}>
                Kaydet
              </Button>
            </>
          }
        >
          <form
            id="practice-outcome-form"
            className="student-modal-form"
            onSubmit={submitPracticeOutcome}
          >
            <label>
              <span>Pratik durumu</span>
              <select
                value={practiceOutcome}
                onChange={(event) =>
                  setPracticeOutcome(event.target.value as 'COMPLETED' | 'SKIPPED' | 'MISSED')
                }
              >
                <option value="COMPLETED">Tamamlandı</option>
                <option value="SKIPPED">Yapılamadı</option>
                <option value="MISSED">Geri dönüş alınmadı</option>
              </select>
            </label>
            {practiceOutcome === 'COMPLETED' ? (
              <label>
                <span>Refleksiyon</span>
                <textarea
                  maxLength={4000}
                  rows={6}
                  value={practiceReflection}
                  onChange={(event) => setPracticeReflection(event.target.value)}
                  placeholder="Öğrencinin pratik sonrası paylaşımını yazın..."
                />
                <small>{practiceReflection.length} / 4000</small>
              </label>
            ) : (
              <Alert tone="warning">
                Bu durum kaydedildiğinde varsa mevcut refleksiyon kaydı kaldırılır.
              </Alert>
            )}
            <label>
              <span>İşlem nedeni</span>
              <textarea
                required
                maxLength={500}
                rows={3}
                value={practiceOutcomeReason}
                onChange={(event) => setPracticeOutcomeReason(event.target.value)}
              />
            </label>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}

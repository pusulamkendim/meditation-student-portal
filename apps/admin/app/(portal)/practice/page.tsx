'use client';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Metric,
  Modal,
  PageHeader,
  Skeleton,
  TextField,
  Toast,
} from '@meditation/ui';
import {
  Ban,
  CheckCircle2,
  Clock3,
  History,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings2,
  UserRound,
  XCircle,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

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
  reflectionTags?: Array<{ tag: string; confidence: number }>;
};
type Plan = {
  id: string;
  subscriptionPeriodId: string;
  status: string;
  revision: number;
  slots: Array<{ slotKey: string; localTime: string; active: boolean }>;
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
const tones: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  COMPLETED: 'success',
  SKIPPED: 'warning',
  MISSED: 'danger',
  CANCELLED: 'neutral',
  REMINDED: 'info',
  AWAITING_RESPONSE: 'warning',
  SCHEDULED: 'info',
};

function studentLabel(session: Session) {
  return session.studentName ?? `İsimsiz öğrenci · ${session.studentId.slice(0, 8)}`;
}
function slotLabel(slot?: string) {
  return slot === 'MORNING' ? 'Sabah' : slot === 'EVENING' ? 'Akşam' : 'Pratik';
}
function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
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
      setSubscriptionId(value.plan?.subscriptionPeriodId ?? value.subscriptions[0]?.id ?? '');
      if (!value.plan) setNotice('Bu öğrenci için aktif pratik planı bulunmuyor.');
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Plan yüklenemedi.');
    } finally {
      setBusy(false);
    }
  }

  function openSession(session: Session) {
    setSelected(session);
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
        },
        {
          slotKey: 'EVENING',
          localTime: form.get('evening'),
          active: form.get('eveningActive') === 'on',
        },
      ],
      durationOverride: form.get('duration') ? Number(form.get('duration')) : undefined,
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
          <div className="practice-metrics">
            <Metric icon={CheckCircle2} label="Tamamlanan" value={counts.completed} />
            <Metric icon={XCircle} label="Tamamlanmayan" value={counts.incomplete} />
            <Metric icon={Clock3} label="Planlanan" value={counts.planned} />
            <Metric icon={History} label="Yanıt bekleyen" value={counts.awaiting} />
          </div>
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
              <div className="practice-layout">
                <section className="practice-table">
                  <div className="practice-table__head">
                    <span>Öğrenci</span>
                    <span>Tarih ve saat</span>
                    <span>Oturum</span>
                    <span>Durum</span>
                    <span />
                  </div>
                  {visible.length ? (
                    visible.map((item) => (
                      <button
                        className="practice-row"
                        data-selected={selected?.id === item.id}
                        key={item.id}
                        onClick={() => openSession(item)}
                      >
                        <span className="practice-student-name">{studentLabel(item)}</span>
                        <span>{new Date(item.startAt).toLocaleString('tr-TR')}</span>
                        <span>
                          {slotLabel(item.slot)} · {item.durationMinutes} dk
                        </span>
                        <Badge tone={tones[item.status] ?? 'neutral'}>
                          {statusLabels[item.status] ?? item.status}
                        </Badge>
                        <Clock3 aria-hidden="true" />
                      </button>
                    ))
                  ) : (
                    <EmptyState icon={Clock3} title="Bu görünümde pratik yok" />
                  )}
                </section>
                <aside className="practice-detail">
                  {selected ? (
                    <>
                      <header>
                        <div>
                          <small>SEÇİLİ OTURUM</small>
                          <h2>{studentLabel(selected)}</h2>
                        </div>
                        <Badge tone={tones[selected.status] ?? 'neutral'}>
                          {statusLabels[selected.status] ?? selected.status}
                        </Badge>
                      </header>
                      <dl className="practice-detail-list">
                        <div>
                          <dt>Zaman</dt>
                          <dd>{new Date(selected.startAt).toLocaleString('tr-TR')}</dd>
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
                      <a className="student-link" href={`/students/${selected.studentId}`}>
                        <UserRound aria-hidden="true" /> Öğrenci sayfasını aç
                      </a>
                      {selected.reflectionTags?.length ? (
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
                  ) : (
                    <EmptyState
                      title="Bir oturum seçin"
                      description="Detay ve aksiyonlar burada görünür."
                    />
                  )}
                </aside>
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
                      name="duration"
                      label="Özel süre (dk)"
                      type="number"
                      min="1"
                      max="180"
                      placeholder="Kademeli plan"
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
    </main>
  );
}

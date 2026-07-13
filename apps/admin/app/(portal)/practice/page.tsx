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
import { Ban, CheckCircle2, Clock3, Play, RefreshCw } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Session = {
  id: string;
  studentId: string;
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
  sessions: Array<Session>;
};
const tones: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  COMPLETED: 'success',
  SKIPPED: 'warning',
  MISSED: 'danger',
  CANCELLED: 'neutral',
  SUPPRESSED: 'neutral',
  REMINDED: 'warning',
  AWAITING_RESPONSE: 'warning',
  SCHEDULED: 'info' as never,
};
export default function PracticePage() {
  const [sessions, setSessions] = useState<Session[]>();
  const [selected, setSelected] = useState<Session>();
  const [plan, setPlan] = useState<Plan>();
  const [subscriptionId, setSubscriptionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('HISTORY');
  const [practiceDialog, setPracticeDialog] = useState<'reschedule' | 'cancel' | 'restore'>();
  const [practiceDate, setPracticeDate] = useState('');
  const [practiceReason, setPracticeReason] = useState('');
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const r = await fetch(`${api}/v1/admin/practice-sessions`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSessions(((await r.json()) as { items: Session[] }).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pratikler yüklenemedi.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(() => {
    const items = sessions ?? [];
    if (filter === 'PLANNED')
      return items
        .filter(
          (s) =>
            ['SCHEDULED', 'REMINDED'].includes(s.status) &&
            new Date(s.startAt).getTime() >= Date.now(),
        )
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    if (filter === 'CANCELLED')
      return items
        .filter((s) => s.status === 'CANCELLED')
        .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
    return items
      .filter((s) => ['COMPLETED', 'MISSED', 'SKIPPED', 'AWAITING_RESPONSE'].includes(s.status))
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }, [sessions, filter]);
  async function request(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    try {
      const r = await fetch(`${api}/v1/${path}`, {
        method,
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
        },
        body: JSON.stringify(body),
      });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.message ?? `HTTP ${r.status}`);
      setNotice('İşlem kaydedildi.');
      await load();
      return v;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }
  function toLocalDateTime(value: string) {
    const date = new Date(value);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
  }
  function openPracticeDialog(action: 'reschedule' | 'cancel' | 'restore') {
    if (!selected) return;
    setPracticeDialog(action);
    setPracticeDate(action === 'reschedule' ? toLocalDateTime(selected.startAt) : '');
    setPracticeReason(
      action === 'cancel'
        ? 'Admin iptali'
        : action === 'restore'
          ? 'Admin geri aldı'
          : 'Admin saat güncellemesi',
    );
  }
  async function submitPracticeDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !practiceDialog || !practiceReason.trim()) return;
    if (practiceDialog === 'reschedule' && !practiceDate) return;
    const path =
      practiceDialog === 'reschedule'
        ? `admin/practice-sessions/${selected.id}`
        : `admin/practice-sessions/${selected.id}/${practiceDialog}`;
    const body =
      practiceDialog === 'reschedule'
        ? {
            startAt: new Date(practiceDate).toISOString(),
            expectedVersion: selected.version,
            reason: practiceReason.trim(),
          }
        : { reason: practiceReason.trim() };
    await request(path, body, practiceDialog === 'reschedule' ? 'PATCH' : 'POST');
    setPracticeDialog(undefined);
    setSelected(undefined);
  }
  async function loadPlanFor(id: string) {
    const targetId = id.trim();
    if (!targetId) return;
    setBusy(true);
    try {
      const r = await fetch(`${api}/v1/admin/students/${targetId}/practice-plan`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const value = (await r.json()) as {
        plan: Plan | null;
        subscriptions: Array<{ id: string; status: string }>;
      };
      setPlan(value.plan ?? undefined);
      setSubscriptionId(value.plan?.subscriptionPeriodId ?? value.subscriptions[0]?.id ?? '');
      if (!value.plan) setNotice('Bu öğrenci için aktif pratik planı bulunmuyor.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Plan yüklenemedi.');
    } finally {
      setBusy(false);
    }
  }
  async function loadPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadPlanFor(studentId);
  }
  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscriptionId) return;
    const data = new FormData(event.currentTarget);
    await request(`admin/students/${studentId}/practice-plan/versions`, {
      subscriptionId,
      slots: [
        {
          slotKey: 'MORNING',
          localTime: data.get('morning'),
          active: data.get('morningActive') === 'on',
        },
        {
          slotKey: 'EVENING',
          localTime: data.get('evening'),
          active: data.get('eveningActive') === 'on',
        },
      ],
      durationOverride: data.get('duration') ? Number(data.get('duration')) : undefined,
    });
    await loadPlanFor(studentId);
  }
  return (
    <main className="content">
      <PageHeader
        title="Pratikler"
        description="Günlük program, takip ve yaklaşan seans yönetimi"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw />
            Yenile
          </Button>
        }
      />
      {notice ? (
        <div className="toast-region">
          <Toast tone="info" onDismiss={() => setNotice(undefined)}>
            {notice}
          </Toast>
        </div>
      ) : null}
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : !sessions ? (
        <Skeleton />
      ) : (
        <>
          <div className="payment-toolbar">
            <div className="payment-filters">
              {[
                ['HISTORY', 'Oturum geçmişi'],
                ['PLANNED', 'Planlanan'],
                ['CANCELLED', 'İptal edilen'],
              ].map(([key, text]) => (
                <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
          <div className="practice-layout">
            <section className="practice-table">
              <div className="practice-table__head">
                <span>Öğrenci</span>
                <span>Zaman</span>
                <span>Slot</span>
                <span>Durum</span>
                <span></span>
              </div>
              {visible.length ? (
                visible.map((item) => (
                  <button
                    className="practice-row"
                    data-selected={selected?.id === item.id}
                    key={item.id}
                    onClick={() => {
                      setSelected(item);
                      setStudentId(item.studentId);
                      void loadPlanFor(item.studentId);
                    }}
                  >
                    <span>{item.studentId.slice(0, 8)}</span>
                    <span>{new Date(item.startAt).toLocaleString('tr-TR')}</span>
                    <span>
                      {item.slot === 'MORNING'
                        ? 'Sabah'
                        : item.slot === 'EVENING'
                          ? 'Akşam'
                          : 'Pratik'}{' '}
                      ·{' '}
                      {new Date(item.startAt).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {item.durationMinutes} dk
                    </span>
                    <Badge tone={tones[item.status] ?? 'neutral'}>{item.status}</Badge>
                    <Clock3 />
                  </button>
                ))
              ) : (
                <EmptyState icon={Clock3} title="Bu filtrede pratik yok" />
              )}
            </section>
            <aside className="practice-detail">
              {selected ? (
                <>
                  <header>
                    <div>
                      <small>Seans</small>
                      <h2>
                        {selected.slot === 'MORNING'
                          ? 'Sabah'
                          : selected.slot === 'EVENING'
                            ? 'Akşam'
                            : 'Pratik'}{' '}
                        ·{' '}
                        {new Date(selected.startAt).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {selected.durationMinutes} dk
                      </h2>
                    </div>
                    <Badge tone={tones[selected.status] ?? 'neutral'}>{selected.status}</Badge>
                  </header>
                  <p>{new Date(selected.startAt).toLocaleString('tr-TR')}</p>
                  {selected.reflectionTags?.length ? (
                    <div className="practice-tags">
                      <strong>AI gözlem etiketleri</strong>
                      <div>
                        {selected.reflectionTags.map((tag) => (
                          <Badge key={tag.tag} tone="info">
                            {tag.tag} · {Math.round(tag.confidence * 100)}%
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {['SCHEDULED', 'REMINDED'].includes(selected.status) ? (
                    <>
                      <Button
                        variant="secondary"
                        loading={busy}
                        onClick={() => openPracticeDialog('reschedule')}
                      >
                        <Clock3 />
                        Saati değiştir
                      </Button>
                      <Button
                        variant="danger"
                        loading={busy}
                        onClick={() => openPracticeDialog('cancel')}
                      >
                        <Ban />
                        İptal et
                      </Button>
                    </>
                  ) : null}
                  {selected.status === 'CANCELLED' ? (
                    <Button
                      variant="secondary"
                      loading={busy}
                      onClick={() => openPracticeDialog('restore')}
                    >
                      <Play />
                      İptali geri al
                    </Button>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  title="Bir seans seçin"
                  description="Detay ve aksiyonlar burada görünür."
                />
              )}
            </aside>
          </div>
          <section className="section">
            <div className="section-heading">
              <h2>Öğrenci programı</h2>
            </div>
            <form className="practice-plan-lookup" onSubmit={loadPlan}>
              <TextField
                label="Öğrenci ID"
                name="student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="UUID"
              />
              <Button type="submit" loading={busy}>
                Programı aç
              </Button>
            </form>
            {subscriptionId ? (
              <div className="plan-editor">
                <div>
                  <Badge tone={plan?.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {plan?.status ?? 'YENİ PLAN'}
                  </Badge>
                  <strong>{plan ? `Revizyon ${plan.revision}` : 'İlk program'}</strong>
                </div>
                <form onSubmit={createPlan}>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      name="morningActive"
                      defaultChecked={
                        plan?.slots.some((s) => s.slotKey === 'MORNING' && s.active) ?? true
                      }
                    />{' '}
                    Sabah
                  </label>
                  <TextField
                    name="morning"
                    label="Sabah saati"
                    type="time"
                    defaultValue={
                      plan?.slots.find((s) => s.slotKey === 'MORNING')?.localTime ?? '08:00'
                    }
                  />
                  <label className="check-field">
                    <input
                      type="checkbox"
                      name="eveningActive"
                      defaultChecked={
                        plan?.slots.some((s) => s.slotKey === 'EVENING' && s.active) ?? true
                      }
                    />{' '}
                    Akşam
                  </label>
                  <TextField
                    name="evening"
                    label="Akşam saati"
                    type="time"
                    defaultValue={
                      plan?.slots.find((s) => s.slotKey === 'EVENING')?.localTime ?? '20:00'
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
                    <CheckCircle2 />
                    Yeni sürümü kaydet
                  </Button>
                </form>
                {plan && plan.status !== 'DRAFT' ? (
                  <Button
                    variant="ghost"
                    loading={busy}
                    onClick={() =>
                      void request(`admin/students/${studentId}/practice/pause`, {
                        paused: plan.status !== 'PAUSED',
                        reason: plan.status === 'PAUSED' ? 'Admin devam ettirdi' : 'Admin durdurdu',
                      })
                    }
                  >
                    {plan.status === 'PAUSED' ? <Play /> : <Ban />}
                    {plan.status === 'PAUSED' ? 'Devam ettir' : 'Pratikleri durdur'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
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
          description="İşlem öğrencinin pratik kaydına ve gönderim planına audit kaydıyla uygulanır."
          onClose={() => setPracticeDialog(undefined)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setPracticeDialog(undefined)}>
                Vazgeç
              </Button>
              <Button
                form="practice-page-session-form"
                type="submit"
                loading={busy}
                variant={practiceDialog === 'cancel' ? 'danger' : 'primary'}
              >
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

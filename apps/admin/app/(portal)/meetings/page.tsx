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
  CalendarDays,
  Check,
  ExternalLink,
  Link2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Video,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Meeting = {
  id: string;
  occurrenceNumber: number;
  studentId: string;
  studentName?: string;
  subscriptionPeriodId: string;
  startsAt: string;
  endsAt: string;
  originalStartsAt?: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  version: number;
  calendarSyncStatus: string;
  conferenceStatus: string;
  meetUrl?: string;
  series: {
    id: string;
    timezone: string;
    version: number;
    googleSeriesId?: string;
    recurrenceRule: string;
  };
  summary?: {
    plannedPracticeCount: number;
    completedPracticeCount: number;
    skippedPracticeCount: number;
    missedPracticeCount: number;
    completionRate: number;
    generatedAt: string;
  };
  discrepancies: Array<{ id: string; type: string; status: string; createdAt: string }>;
};
type Subscription = {
  id: string;
  studentId: string;
  studentName?: string;
  status: string;
  timezone: string;
  startDate: string;
  endExclusive: string;
};
type Connection = {
  configured: boolean;
  status: string;
  calendarName?: string;
  lastSuccessfulSyncAt?: string;
};
type SummaryDraft = {
  id: string;
  meetingId: string;
  version: number;
  status: string;
  content: string;
  createdAt: string;
  studentId: string;
};

const statusTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  SCHEDULED: 'info',
  COMPLETED: 'success',
  NO_SHOW: 'warning',
  CANCELLED: 'neutral',
  SYNCED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  DISCREPANCY: 'danger',
  READY: 'success',
  MANUAL_OVERRIDE: 'info',
};
const statusLabel: Record<string, string> = {
  SCHEDULED: 'Planlandı',
  COMPLETED: 'Tamamlandı',
  NO_SHOW: 'Katılmadı',
  CANCELLED: 'İptal',
  SYNCED: 'Senkron',
  PENDING: 'Bekliyor',
  FAILED: 'Hatalı',
  DISCREPANCY: 'Fark var',
  READY: 'Hazır',
  MANUAL_OVERRIDE: 'Manuel link',
};

function formatDate(value: string, timezone?: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

function toDateTimeInput(value: string) {
  const date = new Date(value);
  const pad = (entry: number) => String(entry).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function MeetingsPage() {
  const [items, setItems] = useState<Meeting[]>();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [connection, setConnection] = useState<Connection>();
  const [drafts, setDrafts] = useState<SummaryDraft[]>([]);
  const [selected, setSelected] = useState<Meeting>();
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [meetingsResponse, subscriptionsResponse, draftsResponse] = await Promise.all([
        fetch(`${api}/v1/admin/meetings`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/meeting-subscriptions`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch(`${api}/v1/admin/summary-drafts`, { credentials: 'include', cache: 'no-store' }),
      ]);
      if (!meetingsResponse.ok) throw new Error(`Toplantılar HTTP ${meetingsResponse.status}`);
      if (!subscriptionsResponse.ok)
        throw new Error(`Paketler HTTP ${subscriptionsResponse.status}`);
      const meetings = (await meetingsResponse.json()) as {
        items: Meeting[];
        connection: Connection;
      };
      const available = (await subscriptionsResponse.json()) as { items: Subscription[] };
      const summaryDrafts = draftsResponse.ok
        ? ((await draftsResponse.json()) as SummaryDraft[])
        : [];
      setItems(meetings.items);
      setConnection(meetings.connection);
      setSubscriptions(available.items);
      setDrafts(summaryDrafts);
      setSelected((current) =>
        current ? meetings.items.find((item) => item.id === current.id) : undefined,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Görüşmeler yüklenemedi.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function request(path: string, init: RequestInit = {}) {
    setBusy(true);
    try {
      const response = await fetch(`${api}/v1/admin/${path}`, {
        ...init,
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
          ...(init.headers ?? {}),
        },
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof value.message === 'string' ? value.message : `HTTP ${response.status}`,
        );
      return value;
    } finally {
      setBusy(false);
    }
  }

  async function createSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const subscriptionId = String(data.get('subscriptionId') ?? '');
    const firstStartsAt = String(data.get('firstStartsAt') ?? '');
    if (!subscriptionId || !firstStartsAt) return;
    try {
      await request(`subscriptions/${subscriptionId}/meeting-series`, {
        method: 'POST',
        body: JSON.stringify({ firstStartsAt: new Date(firstStartsAt).toISOString() }),
      });
      form.reset();
      setNotice('Dört görüşmelik seri oluşturuldu. Takvim senkronu kuyruğa alındı.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Seri oluşturulamadı.');
    }
  }

  async function reschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    try {
      await request(`meetings/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          startsAt: new Date(String(data.get('startsAt'))).toISOString(),
          expectedVersion: selected.version,
          reason: String(data.get('reason') ?? 'Admin yeniden planlaması'),
        }),
      });
      setRescheduleOpen(false);
      setNotice('Görüşme yeniden planlandı.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Görüşme yeniden planlanamadı.');
    }
  }

  async function setStatus(status: Meeting['status']) {
    if (!selected) return;
    try {
      await request(`meetings/${selected.id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          expectedVersion: selected.version,
          reason: 'Admin durum güncellemesi',
        }),
      });
      setStatusOpen(false);
      setNotice('Görüşme durumu kaydedildi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Durum kaydedilemedi.');
    }
  }

  async function saveMeetLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const url = String(new FormData(event.currentTarget).get('url') ?? '');
    try {
      await request(`meeting-series/${selected.series.id}/meet-link`, {
        method: 'PUT',
        body: JSON.stringify({ url }),
      });
      setNotice('Manuel Meet linki kaydedildi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Meet linki kaydedilemedi.');
    }
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selected) return;
    const content = String(new FormData(form).get('content') ?? '');
    try {
      await request(`meetings/${selected.id}/coach-note`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
      form.reset();
      setNotice('Koç notu yeni sürüm olarak kaydedildi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Koç notu kaydedilemedi.');
    }
  }

  async function connectCalendar() {
    try {
      const value = (await request('google-calendar/oauth/start', { headers: {} })) as {
        authorizationUrl: string;
      };
      window.location.assign(value.authorizationUrl);
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : 'Google Calendar bağlantısı başlatılamadı.',
      );
    }
  }

  async function disconnectCalendar() {
    try {
      await request('google-calendar/disconnect', { method: 'POST' });
      setNotice('Google Calendar bağlantısı kesildi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Bağlantı kesilemedi.');
    }
  }

  async function approveDraft(draftId: string) {
    try {
      await request(`summary-drafts/${draftId}/approve`, { method: 'POST' });
      setNotice('Haftalık özet varsayılan kanala gönderim kuyruğuna alındı.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Özet gönderilemedi.');
    }
  }

  async function editDraft(draft: SummaryDraft) {
    const next = window.prompt('Admin düzenlemesi', draft.content);
    if (!next?.trim()) return;
    try {
      await request(`meetings/${draft.meetingId}/summary-drafts`, {
        method: 'POST',
        body: JSON.stringify({ content: next.trim() }),
      });
      setNotice('Özet yeni sürüm olarak kaydedildi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Özet düzenlenemedi.');
    }
  }

  const visible = useMemo(
    () => (items ?? []).filter((item) => filter === 'ALL' || item.status === filter),
    [filter, items],
  );

  return (
    <main className="content">
      <PageHeader
        title="Görüşmeler"
        description="Haftalık görüşme serilerini, Meet linklerini ve paket kredilerini yönetin"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw />
            Yenile
          </Button>
        }
      />
      {notice ? (
        <div className="toast-region">
          <Toast
            tone={
              notice.includes('kaydedildi') || notice.includes('oluşturuldu') ? 'success' : 'danger'
            }
            onDismiss={() => setNotice(undefined)}
          >
            {notice}
          </Toast>
        </div>
      ) : null}
      {error ? (
        <Alert tone="danger" title="Görüşmeler yüklenemedi">
          {error}
        </Alert>
      ) : null}
      <section className="meeting-connection section">
        <div>
          <small>Google Calendar</small>
          <strong>
            {connection?.status === 'CONNECTED'
              ? (connection.calendarName ?? 'Portal Calendar')
              : connection?.status === 'RECONNECT_REQUIRED'
                ? 'Yeniden bağlantı gerekli'
                : 'Bağlı değil'}
          </strong>
          {connection?.lastSuccessfulSyncAt ? (
            <span>Son senkron: {formatDate(connection.lastSuccessfulSyncAt)}</span>
          ) : (
            <span>Seri oluşturulduğunda portal takvimi kullanılır.</span>
          )}
        </div>
        <div className="row-actions">
          {connection?.status === 'CONNECTED' ? (
            <Button variant="secondary" onClick={() => void disconnectCalendar()} loading={busy}>
              <Link2 />
              Bağlantıyı kes
            </Button>
          ) : (
            <Button
              onClick={() => void connectCalendar()}
              loading={busy}
              disabled={connection?.configured === false}
            >
              <Link2 />
              {connection?.configured === false
                ? 'OAuth yapılandırılmadı'
                : 'Google Calendar bağla'}
            </Button>
          )}
        </div>
      </section>
      <section className="meeting-create section">
        <div className="section-heading">
          <div>
            <h2>Yeni görüşme serisi</h2>
            <p>İlk saat seçilir; sonraki üç görüşme aynı saatte haftalık oluşturulur.</p>
          </div>
          <Badge tone="info">60 dk · 4 görüşme</Badge>
        </div>
        <form onSubmit={createSeries} className="meeting-create__form">
          <label className="ui-field">
            <span className="ui-field__label">Paket</span>
            <select className="ui-input" name="subscriptionId" required defaultValue="">
              <option value="" disabled>
                Paket seçin
              </option>
              {subscriptions.map((subscription) => (
                <option key={subscription.id} value={subscription.id}>
                  {subscription.studentName ?? subscription.studentId.slice(0, 8)} ·{' '}
                  {subscription.status} ·{' '}
                  {new Date(subscription.startDate).toLocaleDateString('tr-TR')}
                </option>
              ))}
            </select>
          </label>
          <TextField label="İlk görüşme" name="firstStartsAt" type="datetime-local" required />
          <Button type="submit" loading={busy}>
            <CalendarDays />
            Seriyi oluştur
          </Button>
        </form>
        {subscriptions.length === 0 && items ? (
          <p className="muted">Görüşme serisi olmayan aktif veya planlı paket bulunmuyor.</p>
        ) : null}
      </section>
      <section className="section weekly-drafts">
        <div className="section-heading">
          <div>
            <h2>AI haftalık özet taslakları</h2>
            <p>Özetler yalnızca admin onayından sonra öğrencinin varsayılan kanalına gönderilir.</p>
          </div>
          <Badge tone="warning">Onay gerekli</Badge>
        </div>
        {drafts.length === 0 ? (
          <p className="muted">Bekleyen AI taslağı yok.</p>
        ) : (
          <div className="weekly-draft-list">
            {drafts.map((draft) => (
              <article className="weekly-draft" key={draft.id}>
                <div>
                  <strong>
                    {draft.studentId.slice(0, 8)} · v{draft.version}
                  </strong>
                  <span>
                    {draft.status} · {new Date(draft.createdAt).toLocaleString('tr-TR')}
                  </span>
                  <p>{draft.content}</p>
                </div>
                <div className="row-actions">
                  <Button
                    variant="secondary"
                    onClick={() => void editDraft(draft)}
                    disabled={draft.status !== 'DRAFT'}
                  >
                    Düzenle
                  </Button>
                  <Button
                    onClick={() => void approveDraft(draft.id)}
                    disabled={draft.status !== 'DRAFT'}
                  >
                    <Check /> Onayla ve gönder
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="section">
        <div className="payment-toolbar">
          <div className="payment-filters">
            {[
              ['ALL', 'Tümü'],
              ['SCHEDULED', 'Planlandı'],
              ['COMPLETED', 'Tamamlandı'],
              ['NO_SHOW', 'Katılmadı'],
              ['CANCELLED', 'İptal'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {!items ? (
          <div className="preview-stack">
            <Skeleton />
            <Skeleton />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Görüşme bulunmuyor"
            description="Aktif bir paket seçerek dört görüşmelik seri oluşturun."
          />
        ) : (
          <div className="meeting-layout">
            <div className="meeting-table">
              <div className="meeting-table__head">
                <span>Öğrenci</span>
                <span>Görüşme</span>
                <span>Durum</span>
                <span>Takvim / Meet</span>
              </div>
              {visible.map((item) => (
                <button
                  className="meeting-row"
                  data-selected={selected?.id === item.id}
                  key={item.id}
                  onClick={() => setSelected(item)}
                >
                  <span>
                    <strong>{item.studentName ?? item.studentId.slice(0, 8)}</strong>
                    <small>{item.occurrenceNumber}. görüşme</small>
                  </span>
                  <span>{formatDate(item.startsAt, item.series.timezone)}</span>
                  <span>
                    <Badge tone={statusTone[item.status] ?? 'neutral'}>
                      {statusLabel[item.status] ?? item.status}
                    </Badge>
                  </span>
                  <span className="meeting-row__sync">
                    <Badge tone={statusTone[item.calendarSyncStatus] ?? 'neutral'}>
                      {statusLabel[item.calendarSyncStatus] ?? item.calendarSyncStatus}
                    </Badge>
                    {item.meetUrl ? (
                      <Video aria-label="Meet linki hazır" />
                    ) : (
                      <Video aria-label="Meet linki bekliyor" />
                    )}
                  </span>
                </button>
              ))}
            </div>
            <aside className="meeting-detail">
              {selected ? (
                <>
                  <header>
                    <div>
                      <small>
                        {selected.occurrenceNumber}. görüşme ·{' '}
                        {selected.studentName ?? selected.studentId.slice(0, 8)}
                      </small>
                      <h2>{formatDate(selected.startsAt, selected.series.timezone)}</h2>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Detayı kapat"
                      onClick={() => setSelected(undefined)}
                    >
                      <X />
                    </Button>
                  </header>
                  <div className="meeting-detail__badges">
                    <Badge tone={statusTone[selected.status] ?? 'neutral'}>
                      {statusLabel[selected.status] ?? selected.status}
                    </Badge>
                    <Badge tone={statusTone[selected.conferenceStatus] ?? 'neutral'}>
                      {statusLabel[selected.conferenceStatus] ?? selected.conferenceStatus}
                    </Badge>
                  </div>
                  {selected.meetUrl ? (
                    <a
                      className="meeting-link"
                      href={selected.meetUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Video />
                      Meet linkini aç
                      <ExternalLink />
                    </a>
                  ) : (
                    <Alert tone="warning" title="Meet linki hazır değil">
                      Hatırlatma mesajları link hazır olana kadar bastırılır.
                    </Alert>
                  )}
                  <div className="row-actions">
                    <Button
                      variant="secondary"
                      onClick={() => setRescheduleOpen(true)}
                      disabled={selected.status !== 'SCHEDULED'}
                    >
                      <RotateCcw />
                      Yeniden planla
                    </Button>
                    <Button variant="secondary" onClick={() => setStatusOpen(true)}>
                      <Check />
                      Durumu değiştir
                    </Button>
                  </div>
                  <form className="meeting-inline-form" onSubmit={saveMeetLink}>
                    <TextField
                      label="Manuel Meet linki"
                      name="url"
                      type="url"
                      defaultValue={selected.meetUrl ?? ''}
                      placeholder="https://meet.google.com/..."
                    />
                    <Button type="submit" variant="secondary" loading={busy}>
                      <Link2 />
                      Linki kaydet
                    </Button>
                  </form>
                  <form className="meeting-inline-form" onSubmit={saveNote}>
                    <label className="ui-field">
                      <span className="ui-field__label">Koç notu</span>
                      <textarea
                        className="ui-input meeting-note"
                        name="content"
                        rows={4}
                        placeholder="Görüşme sonrası gözlem ve takip notu"
                        required
                      />
                    </label>
                    <Button type="submit" variant="secondary" loading={busy}>
                      <Check />
                      Notu kaydet
                    </Button>
                  </form>
                  {selected.summary ? (
                    <div className="meeting-summary">
                      <div>
                        <strong>Pratik özeti</strong>
                        <Badge tone="info">
                          {Math.round(selected.summary.completionRate * 100)}%
                        </Badge>
                      </div>
                      <span>
                        {selected.summary.completedPracticeCount} tamamlandı ·{' '}
                        {selected.summary.skippedPracticeCount} atlandı ·{' '}
                        {selected.summary.missedPracticeCount} kaçırıldı
                      </span>
                    </div>
                  ) : null}
                  {selected.discrepancies.length ? (
                    <div className="meeting-discrepancy">
                      <strong>
                        <ShieldAlert /> Takvim farkı
                      </strong>
                      <span>{selected.discrepancies.length} açık kayıt</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="Bir görüşme seçin"
                  description="Meet, durum, özet ve koç notları burada görünür."
                />
              )}
            </aside>
          </div>
        )}
      </section>
      {rescheduleOpen && selected ? (
        <Modal
          title="Görüşmeyi yeniden planla"
          description="Diğer haftalık görüşmelerin zamanı değişmez."
          onClose={() => setRescheduleOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setRescheduleOpen(false)}>
                Vazgeç
              </Button>
              <Button form="meeting-reschedule-form" type="submit" loading={busy}>
                Kaydet
              </Button>
            </>
          }
        >
          <form id="meeting-reschedule-form" onSubmit={reschedule} className="modal-form">
            <TextField
              label="Yeni zaman"
              name="startsAt"
              type="datetime-local"
              defaultValue={toDateTimeInput(selected.startsAt)}
              required
            />
            <TextField label="Neden" name="reason" defaultValue="Öğrenci talebi" required />
          </form>
        </Modal>
      ) : null}
      {statusOpen && selected ? (
        <Modal
          title="Görüşme durumunu değiştir"
          description="Kredi hareketi bu seçime göre append-only kaydedilir."
          onClose={() => setStatusOpen(false)}
          actions={
            <Button variant="ghost" onClick={() => setStatusOpen(false)}>
              Kapat
            </Button>
          }
        >
          <div className="status-actions">
            {selected.status !== 'SCHEDULED' ? (
              <Button variant="secondary" onClick={() => void setStatus('SCHEDULED')}>
                <RotateCcw />
                Tekrar planlandı
              </Button>
            ) : null}
            <Button onClick={() => void setStatus('COMPLETED')}>
              <Check />
              Tamamlandı
            </Button>
            <Button variant="secondary" onClick={() => void setStatus('NO_SHOW')}>
              Katılmadı
            </Button>
            <Button variant="danger" onClick={() => void setStatus('CANCELLED')}>
              <X />
              İptal
            </Button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

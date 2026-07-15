'use client';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  MessageBubble,
  Metric,
  Modal,
  PageHeader,
  Skeleton,
  Toast,
} from '@meditation/ui';
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  MessageCircle,
  LifeBuoy,
  Pause,
  Play,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type Subscription = {
  id: string;
  status: string;
  startDate: string;
  endExclusive: string;
  priceMinor: string;
  currency: string;
  credits: number;
};

type PracticeSession = {
  id: string;
  serviceDate: string;
  startAt: string;
  durationMinutes: number;
  status: string;
  version: number;
  slot?: string;
  localTime?: string;
  cancellationReason?: string;
  reflection?: {
    content?: string;
    createdAt: string;
    tags: Array<{ tag: string; confidence: number }>;
  };
};

type Meeting = {
  id: string;
  seriesId: string;
  subscriptionId: string;
  occurrenceNumber: number;
  startsAt: string;
  endsAt: string;
  status: string;
  version: number;
  timezone: string;
  conferenceStatus: string;
  calendarSyncStatus: string;
  meetUrl?: string;
};

type Detail = {
  id: string;
  fullName?: string;
  status: string;
  registrationStep: string;
  timezone: string;
  preferredLocale: string;
  curriculumStage: string;
  curriculumStageSource: string;
  journey: { key: string; label: string; completedMeetingCount: number; source: string };
  version: number;
  createdAt: string;
  channel?: Channel;
  channels: Channel[];
  messagingPreference?: {
    proactiveEnabled: boolean;
    pausedAt?: string;
    pauseReason?: string;
  };
  subscriptions: Subscription[];
  consents: Array<{
    scope: string;
    status: string;
    textVersion: string;
    channel: string;
    occurredAt: string;
  }>;
  payments: Array<{
    id: string;
    status: string;
    referenceCode: string;
    amountMinor: string;
    currency: string;
    reportedAt: string;
    approvedAt?: string;
    reviewNote?: string;
    subscriptionId?: string;
  }>;
  practicePlan?: {
    id: string;
    subscriptionId: string;
    status: string;
    revision: number;
    effectiveFrom: string;
    effectiveUntil?: string;
    slots: Array<{
      id: string;
      slotKey: string;
      localTime: string;
      durationMinutes: number;
      active: boolean;
    }>;
  };
  practice: {
    completed: number;
    missed: number;
    skipped: number;
    pending: number;
    cancelled: number;
    complianceRate: number;
    nextStartAt?: string;
    sessions: PracticeSession[];
  };
  meetings: Meeting[];
  nextMeetingAt?: string;
  completedMeetingCount: number;
};

type Channel = {
  id: string;
  type: string;
  displayName: string;
  identifier?: string;
  status: string;
  isDefault?: boolean;
  verifiedAt?: string;
  lastInboundAt?: string;
};

type Conversation = {
  items: Array<{
    id: string;
    direction: string;
    status: string;
    occurredAt: string;
    content?: string;
    context?: { eventKey?: string; resolutionMethod: string };
  }>;
  intents: Array<{
    id: string;
    category: string;
    status: string;
    createdAt: string;
    suppressionReason?: string;
  }>;
  handoffs: Array<{
    id: string;
    reason: string;
    status: 'OPEN' | 'RESOLVED';
    sourceMessageId?: string;
    createdAt: string;
    resolvedAt?: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const moneyFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0,
});

const statusLabels: Record<string, string> = {
  ACTIVE: 'Aktif',
  PAYMENT_PENDING: 'Ödeme bekliyor',
  PAUSED: 'Duraklatıldı',
  INACTIVE: 'Pasif',
  LEAD: 'Aday',
  SCHEDULED: 'Planlandı',
  REMINDED: 'Hatırlatma gönderildi',
  AWAITING_RESPONSE: 'Yanıt bekleniyor',
  PENDING: 'Bekliyor',
  CLAIMED: 'İşleniyor',
  DELIVERY_UNKNOWN: 'Teslim durumu belirsiz',
  COMPLETED: 'Tamamlandı',
  MISSED: 'Kaçırıldı',
  SKIPPED: 'Atlandı',
  CANCELLED: 'İptal edildi',
  SUPPRESSED: 'Bastırıldı',
  NO_SHOW: 'Katılmadı',
  REPORTED: 'Bildirildi',
  UNDER_REVIEW: 'İncelemede',
  ACTION_REQUIRED: 'Aksiyon gerekli',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
  EXPIRED: 'Süresi doldu',
};

const statusTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  ACTIVE: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  SCHEDULED: 'info',
  REMINDED: 'info',
  AWAITING_RESPONSE: 'warning',
  PENDING: 'warning',
  CLAIMED: 'info',
  DELIVERY_UNKNOWN: 'warning',
  PAYMENT_PENDING: 'warning',
  REPORTED: 'warning',
  UNDER_REVIEW: 'warning',
  ACTION_REQUIRED: 'danger',
  MISSED: 'danger',
  NO_SHOW: 'danger',
  CANCELLED: 'neutral',
  PAUSED: 'info',
  SKIPPED: 'neutral',
  EXPIRED: 'neutral',
};

function formatDate(value?: string) {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

function formatDateTime(value?: string) {
  return value ? dateTimeFormatter.format(new Date(value)) : '—';
}

function formatTime(value?: string) {
  return value
    ? new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '—';
}

function formatMoney(amountMinor: string, currency: string) {
  const amount = Number(amountMinor) / 100;
  if (currency === 'TRY') return moneyFormatter.format(amount);
  return `${amount.toLocaleString('tr-TR')} ${currency}`;
}

function label(value: string) {
  return statusLabels[value] ?? value.replaceAll('_', ' ');
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string } & T;
  if (!response.ok) throw new Error(payload.message ?? `HTTP ${response.status}`);
  return payload;
}

function csrfHeaders() {
  return {
    'content-type': 'application/json',
    'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
  };
}

function channelLabel(channel?: Channel) {
  if (!channel) return 'Kanal bağlanmadı';
  return `${channel.type === 'WHATSAPP' ? 'WhatsApp' : 'Telegram'}${channel.identifier ? ` · ${channel.identifier}` : ''}`;
}

export default function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<Detail>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [activeTab, setActiveTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [planEditing, setPlanEditing] = useState(false);
  const [planForm, setPlanForm] = useState({
    morning: '08:00',
    evening: '21:00',
    morningActive: true,
    eveningActive: true,
    duration: '30',
  });
  const [practiceAction, setPracticeAction] = useState<'pause' | 'restore'>();
  const [practiceReason, setPracticeReason] = useState('');
  const [practiceTab, setPracticeTab] = useState<'history' | 'planned' | 'cancelled'>('history');
  const [practiceDialog, setPracticeDialog] = useState<'reschedule' | 'cancel' | 'restore'>();
  const [selectedPractice, setSelectedPractice] = useState<PracticeSession>();
  const [practiceDate, setPracticeDate] = useState('');
  const [meetingDialog, setMeetingDialog] = useState<'create' | 'reschedule' | 'status'>();
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting>();
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingReason, setMeetingReason] = useState('');
  const [meetingTargetStatus, setMeetingTargetStatus] = useState('COMPLETED');
  const [conversation, setConversation] = useState<Conversation>();
  const [conversationError, setConversationError] = useState<string>();
  const [conversationLoading, setConversationLoading] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<'note'>();
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>();
  const [paymentNote, setPaymentNote] = useState('');

  const load = useCallback(async () => {
    try {
      setError(undefined);
      const value = await requestJson<Detail>(`/v1/admin/students/${studentId}`);
      setData(value);
      const slots = value.practicePlan?.slots ?? [];
      setPlanForm({
        morning: slots.find((slot) => slot.slotKey === 'MORNING')?.localTime ?? '08:00',
        evening: slots.find((slot) => slot.slotKey === 'EVENING')?.localTime ?? '21:00',
        morningActive: slots.find((slot) => slot.slotKey === 'MORNING')?.active ?? true,
        eveningActive: slots.find((slot) => slot.slotKey === 'EVENING')?.active ?? true,
        duration: String(slots.find((slot) => slot.active)?.durationMinutes ?? 30),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Öğrenci yüklenemedi');
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadConversation = useCallback(async () => {
    try {
      setConversationLoading(true);
      setConversationError(undefined);
      setConversation(await requestJson<Conversation>(`/v1/admin/conversations/${studentId}`));
    } catch (reason) {
      setConversationError(reason instanceof Error ? reason.message : 'Konuşma yüklenemedi');
    } finally {
      setConversationLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (activeTab === 'conversations' && !conversation && !conversationLoading)
      void loadConversation();
  }, [activeTab, conversation, conversationLoading, loadConversation]);

  const runMutation = useCallback(
    async (path: string, init: RequestInit, successMessage: string) => {
      try {
        setBusy(true);
        await requestJson(path, init);
        setNotice(successMessage);
        await load();
      } catch (reason) {
        setNotice(reason instanceof Error ? reason.message : 'İşlem tamamlanamadı');
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subscription = data?.subscriptions.find(
      (item) => item.status === 'ACTIVE' || item.status === 'SCHEDULED',
    );
    if (!subscription) {
      setNotice('Pratik planı için aktif veya planlanmış bir üyelik gerekiyor.');
      return;
    }
    await runMutation(
      `/v1/admin/students/${studentId}/practice-plan/versions`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          subscriptionId: subscription.id,
          slots: [
            { slotKey: 'MORNING', localTime: planForm.morning, active: planForm.morningActive },
            { slotKey: 'EVENING', localTime: planForm.evening, active: planForm.eveningActive },
          ],
          durationOverride: Number(planForm.duration),
        }),
      },
      'Pratik planı güncellendi.',
    );
    setPlanEditing(false);
  }

  async function submitPracticeAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!practiceAction) return;
    await runMutation(
      `/v1/admin/students/${studentId}/practice/pause`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ paused: practiceAction === 'pause', reason: practiceReason }),
      },
      practiceAction === 'pause'
        ? 'Pratik planı duraklatıldı.'
        : 'Pratik planı yeniden başlatıldı.',
    );
    setPracticeAction(undefined);
    setPracticeReason('');
  }

  async function submitPracticeDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPractice || !practiceDialog || !practiceReason.trim()) return;
    if (practiceDialog === 'reschedule' && !practiceDate) return;
    if (practiceDialog === 'reschedule') {
      await runMutation(
        `/v1/admin/practice-sessions/${selectedPractice.id}`,
        {
          method: 'PATCH',
          headers: csrfHeaders(),
          body: JSON.stringify({
            startAt: new Date(practiceDate).toISOString(),
            expectedVersion: selectedPractice.version,
            reason: practiceReason.trim(),
          }),
        },
        'Pratik saati güncellendi.',
      );
    } else {
      await runMutation(
        `/v1/admin/practice-sessions/${selectedPractice.id}/${practiceDialog}`,
        {
          method: 'POST',
          headers: csrfHeaders(),
          body: JSON.stringify({ reason: practiceReason.trim() }),
        },
        practiceDialog === 'cancel' ? 'Pratik iptal edildi.' : 'Pratik yeniden planlandı.',
      );
    }
    closePracticeDialog();
  }

  function openPracticeReschedule(session: PracticeSession) {
    setSelectedPractice(session);
    setPracticeDate(toLocalDateTime(session.startAt));
    setPracticeReason('Öğrenci programına göre güncellendi.');
    setPracticeDialog('reschedule');
  }

  function openPracticeDialog(session: PracticeSession, action: 'cancel' | 'restore') {
    setSelectedPractice(session);
    setPracticeReason(
      action === 'cancel' ? 'Öğrenci programına göre iptal edildi.' : 'İptal geri alındı.',
    );
    setPracticeDialog(action);
  }

  function closePracticeDialog() {
    setPracticeDialog(undefined);
    setSelectedPractice(undefined);
    setPracticeDate('');
    setPracticeReason('');
  }

  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (meetingDialog === 'create') {
      const subscription = data?.subscriptions.find(
        (item) => item.status === 'ACTIVE' || item.status === 'SCHEDULED',
      );
      if (!subscription || !meetingDate) return;
      await runMutation(
        `/v1/admin/subscriptions/${subscription.id}/meeting-series`,
        {
          method: 'POST',
          headers: csrfHeaders(),
          body: JSON.stringify({ firstStartsAt: new Date(meetingDate).toISOString() }),
        },
        'Haftalık görüşme serisi oluşturuldu.',
      );
    } else if (meetingDialog === 'reschedule' && selectedMeeting) {
      await runMutation(
        `/v1/admin/meetings/${selectedMeeting.id}`,
        {
          method: 'PATCH',
          headers: csrfHeaders(),
          body: JSON.stringify({
            startsAt: new Date(meetingDate).toISOString(),
            expectedVersion: selectedMeeting.version,
            reason: meetingReason,
          }),
        },
        'Görüşme saati güncellendi.',
      );
    } else if (meetingDialog === 'status' && selectedMeeting) {
      await runMutation(
        `/v1/admin/meetings/${selectedMeeting.id}/status`,
        {
          method: 'POST',
          headers: csrfHeaders(),
          body: JSON.stringify({
            status: meetingTargetStatus,
            expectedVersion: selectedMeeting.version,
            reason: meetingReason,
          }),
        },
        `Görüşme durumu “${label(meetingTargetStatus)}” olarak güncellendi.`,
      );
    }
    closeMeetingDialog();
  }

  function openReschedule(meeting: Meeting) {
    setSelectedMeeting(meeting);
    setMeetingDate(toLocalDateTime(meeting.startsAt));
    setMeetingReason('Öğrenci programına göre güncellendi.');
    setMeetingDialog('reschedule');
  }

  function openStatus(meeting: Meeting, status: string) {
    setSelectedMeeting(meeting);
    setMeetingTargetStatus(status);
    setMeetingReason('Görüşme durumu admin panelinden güncellendi.');
    setMeetingDialog('status');
  }

  function closeMeetingDialog() {
    setMeetingDialog(undefined);
    setSelectedMeeting(undefined);
    setMeetingDate('');
    setMeetingReason('');
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const content = String(new FormData(form).get('content') ?? '').trim();
    if (!content) return;
    await runMutation(
      `/v1/admin/conversations/${studentId}/reply`,
      { method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ content }) },
      'Yanıt gönderim kuyruğuna alındı.',
    );
    form.reset();
    await loadConversation();
  }

  async function resolveHandoff(handoffId: string, content?: string) {
    try {
      setBusy(true);
      await requestJson(`/v1/admin/conversations/${studentId}/handoffs/${handoffId}/resolve`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify(content ? { content } : {}),
      });
      setNotice(
        content ? 'Yanıt gönderim kuyruğuna alındı ve handover kapatıldı.' : 'Handover kapatıldı.',
      );
      await Promise.all([load(), loadConversation()]);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Handover kapatılamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function approvePayment(paymentId: string) {
    await runMutation(
      `/v1/admin/payments/${paymentId}/approve`,
      { method: 'POST', headers: csrfHeaders(), body: JSON.stringify({}) },
      'Ödeme onaylandı ve üyelik akışı güncellendi.',
    );
  }

  async function markPaymentActionRequired(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPaymentId || !paymentNote.trim()) return;
    await runMutation(
      `/v1/admin/payments/${selectedPaymentId}/action-required`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ note: paymentNote.trim() }),
      },
      'Ödeme aksiyon gerekli olarak işaretlendi.',
    );
    setPaymentDialog(undefined);
    setSelectedPaymentId(undefined);
    setPaymentNote('');
  }

  const tabs = useMemo(
    () => [
      { key: 'overview', label: 'Genel bakış', icon: Activity },
      { key: 'practices', label: 'Pratikler', icon: Clock3, count: data?.practice.sessions.length },
      { key: 'meetings', label: 'Görüşmeler', icon: CalendarClock, count: data?.meetings.length },
      { key: 'conversations', label: 'Konuşmalar', icon: MessageCircle },
      { key: 'payments', label: 'Ödemeler', icon: CreditCard, count: data?.payments.length },
      { key: 'profile', label: 'Profil ve izinler', icon: Settings2 },
    ],
    [data],
  );

  if (error)
    return (
      <main className="content">
        <a className="back-link" href="/students">
          <ArrowLeft aria-hidden="true" /> Öğrenciler
        </a>
        <Alert tone="danger" title="Öğrenci yüklenemedi">
          {error}
        </Alert>
      </main>
    );
  if (!data)
    return (
      <main className="content">
        <Skeleton className="student-detail-skeleton" />
        <Skeleton className="student-detail-skeleton" />
      </main>
    );

  return (
    <main className="content">
      <a className="back-link" href="/students">
        <ArrowLeft aria-hidden="true" /> Öğrenciler
      </a>
      <PageHeader
        title={data.fullName ?? 'İsim belirtilmedi'}
        description={`${data.id.slice(0, 8)} · ${data.registrationStep} · ${data.timezone}`}
        actions={
          <div className="student-header-actions">
            <Badge tone={statusTone[data.status] ?? 'neutral'}>{label(data.status)}</Badge>
            <Badge tone="info">{data.journey.label}</Badge>
          </div>
        }
      />
      <div className="student-context-strip">
        <div>
          <span>Varsayılan kanal</span>
          <strong>{channelLabel(data.channel)}</strong>
        </div>
        <div>
          <span>Paket</span>
          <strong>
            {data.subscriptions[0] ? label(data.subscriptions[0].status) : 'Paket yok'}
          </strong>
        </div>
        <div>
          <span>Sonraki görüşme</span>
          <strong>{formatDateTime(data.nextMeetingAt)}</strong>
        </div>
        <div>
          <span>Son güncelleme</span>
          <strong>{formatDate(data.createdAt)}</strong>
        </div>
      </div>

      <nav className="student-tabs" role="tablist" aria-label="Öğrenci detay bölümleri">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              data-active={activeTab === tab.key}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon aria-hidden="true" />
              {tab.label}
              {tab.count !== undefined ? <small>{tab.count}</small> : null}
            </button>
          );
        })}
      </nav>

      {activeTab === 'overview' ? <Overview data={data} /> : null}
      {activeTab === 'practices' ? (
        <PracticesTab
          data={data}
          planEditing={planEditing}
          planForm={planForm}
          setPlanEditing={setPlanEditing}
          setPlanForm={setPlanForm}
          savePlan={savePlan}
          busy={busy}
          setPracticeAction={setPracticeAction}
          practiceTab={practiceTab}
          setPracticeTab={setPracticeTab}
          onReschedule={openPracticeReschedule}
          onCancel={(session) => openPracticeDialog(session, 'cancel')}
          onRestore={(session) => openPracticeDialog(session, 'restore')}
        />
      ) : null}
      {activeTab === 'meetings' ? (
        <MeetingsTab
          data={data}
          busy={busy}
          openReschedule={openReschedule}
          openStatus={openStatus}
          openCreate={() => {
            setMeetingDate('');
            setMeetingDialog('create');
          }}
        />
      ) : null}
      {activeTab === 'conversations' ? (
        <ConversationsTab
          data={data}
          conversation={conversation}
          loading={conversationLoading}
          error={conversationError}
          onReload={loadConversation}
          onReply={reply}
          onResolveHandoff={resolveHandoff}
          busy={busy}
        />
      ) : null}
      {activeTab === 'payments' ? (
        <PaymentsTab
          data={data}
          busy={busy}
          approvePayment={approvePayment}
          openActionRequired={(paymentId) => {
            setSelectedPaymentId(paymentId);
            setPaymentDialog('note');
          }}
        />
      ) : null}
      {activeTab === 'profile' ? <ProfileTab data={data} /> : null}

      {notice ? (
        <Toast tone="info" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Toast>
      ) : null}

      {practiceAction ? (
        <Modal
          title={practiceAction === 'pause' ? 'Pratikleri duraklat' : 'Pratikleri yeniden başlat'}
          description="Bu işlem öğrencinin gelecek pratik oturumlarını etkiler."
          onClose={() => setPracticeAction(undefined)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setPracticeAction(undefined)}>
                Vazgeç
              </Button>
              <Button form="practice-action-form" type="submit" loading={busy}>
                {practiceAction === 'pause' ? 'Duraklat' : 'Yeniden başlat'}
              </Button>
            </>
          }
        >
          <form
            id="practice-action-form"
            className="student-modal-form"
            onSubmit={submitPracticeAction}
          >
            <label>
              <span>Not</span>
              <textarea
                required
                value={practiceReason}
                onChange={(event) => setPracticeReason(event.target.value)}
                placeholder="Örn. seyahat nedeniyle ara verildi"
              />
            </label>
          </form>
        </Modal>
      ) : null}

      {practiceDialog ? (
        <Modal
          title={
            practiceDialog === 'reschedule'
              ? 'Pratik saatini değiştir'
              : practiceDialog === 'cancel'
                ? 'Pratiği iptal et'
                : 'İptali geri al'
          }
          description={
            practiceDialog === 'reschedule'
              ? 'Yeni saat öğrencinin yerel gününde ve gelecekte olmalıdır.'
              : 'Bu işlem pratik oturumunun durumunu ve gönderim planını günceller.'
          }
          onClose={closePracticeDialog}
          actions={
            <>
              <Button variant="ghost" onClick={closePracticeDialog}>
                Vazgeç
              </Button>
              <Button
                form="practice-session-form"
                type="submit"
                loading={busy}
                variant={practiceDialog === 'cancel' ? 'danger' : 'primary'}
              >
                {practiceDialog === 'reschedule'
                  ? 'Saati güncelle'
                  : practiceDialog === 'cancel'
                    ? 'İptal et'
                    : 'Geri al'}
              </Button>
            </>
          }
        >
          <form
            id="practice-session-form"
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

      {meetingDialog ? (
        <Modal
          title={
            meetingDialog === 'create'
              ? 'Görüşme serisi oluştur'
              : meetingDialog === 'reschedule'
                ? 'Görüşmeyi yeniden planla'
                : 'Görüşme durumunu güncelle'
          }
          description="Değişiklik öğrencinin zaman dilimine göre kaydedilir."
          onClose={closeMeetingDialog}
          actions={
            <>
              <Button variant="ghost" onClick={closeMeetingDialog}>
                Vazgeç
              </Button>
              <Button form="meeting-form" type="submit" loading={busy}>
                Kaydet
              </Button>
            </>
          }
        >
          <form id="meeting-form" className="student-modal-form" onSubmit={submitMeeting}>
            {meetingDialog !== 'status' ? (
              <label>
                <span>
                  {meetingDialog === 'create' ? 'İlk görüşme zamanı' : 'Yeni başlangıç zamanı'}
                </span>
                <input
                  required
                  type="datetime-local"
                  value={meetingDate}
                  onChange={(event) => setMeetingDate(event.target.value)}
                />
              </label>
            ) : (
              <label>
                <span>Yeni durum</span>
                <select
                  value={meetingTargetStatus}
                  onChange={(event) => setMeetingTargetStatus(event.target.value)}
                >
                  <option value="COMPLETED">Tamamlandı</option>
                  <option value="NO_SHOW">Katılmadı</option>
                  <option value="CANCELLED">İptal edildi</option>
                  <option value="SCHEDULED">Planlandı</option>
                </select>
              </label>
            )}
            {meetingDialog !== 'create' ? (
              <label>
                <span>Değişiklik nedeni</span>
                <textarea
                  required
                  value={meetingReason}
                  onChange={(event) => setMeetingReason(event.target.value)}
                />
              </label>
            ) : null}
          </form>
        </Modal>
      ) : null}

      {paymentDialog === 'note' ? (
        <Modal
          title="Ödeme için aksiyon notu"
          description="Öğrencinin ödeme kaydında takip edilecek notu yazın."
          onClose={() => setPaymentDialog(undefined)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setPaymentDialog(undefined)}>
                Vazgeç
              </Button>
              <Button form="payment-note-form" type="submit" loading={busy}>
                Kaydet
              </Button>
            </>
          }
        >
          <form
            id="payment-note-form"
            className="student-modal-form"
            onSubmit={markPaymentActionRequired}
          >
            <label>
              <span>Not</span>
              <textarea
                required
                value={paymentNote}
                onChange={(event) => setPaymentNote(event.target.value)}
                placeholder="Eksik dekont bilgisi..."
              />
            </label>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}

function Overview({ data }: { data: Detail }) {
  const latestSubscription = data.subscriptions[0];
  const historySessions = data.practice.sessions
    .filter((session) => ['COMPLETED', 'MISSED', 'SKIPPED'].includes(session.status))
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  return (
    <div className="student-tab-content">
      <div className="student-metrics">
        <Metric
          label="Tamamlanan pratik"
          value={data.practice.completed}
          detail={`${data.practice.complianceRate}% uyum`}
          icon={CheckCircle2}
        />
        <Metric
          label="Tamamlanmayan pratik"
          value={data.practice.missed + data.practice.skipped}
          detail={`${data.practice.missed} dönüş yok · ${data.practice.skipped} yapılamadı`}
          icon={XCircle}
        />
        <Metric
          label="Sonraki görüşme"
          value={formatDateTime(data.nextMeetingAt)}
          detail="Haftalık görüşme"
          icon={Clock3}
        />
        <Metric
          label="Tamamlanan görüşme"
          value={data.completedMeetingCount}
          detail={`${data.journey.label} yolculuğu`}
          icon={CalendarClock}
        />
      </div>
      <div className="student-overview-grid">
        <section className="student-panel">
          <div className="student-panel__heading">
            <div>
              <span className="eyebrow">ÜYELİK</span>
              <h2>Aktif paket</h2>
            </div>
            {latestSubscription ? (
              <Badge tone={statusTone[latestSubscription.status] ?? 'neutral'}>
                {label(latestSubscription.status)}
              </Badge>
            ) : null}
          </div>
          {latestSubscription ? (
            <dl className="student-info-list">
              <div>
                <dt>Dönem</dt>
                <dd>
                  {formatDate(latestSubscription.startDate)} –{' '}
                  {formatDate(latestSubscription.endExclusive)}
                </dd>
              </div>
              <div>
                <dt>Paket</dt>
                <dd>
                  {formatMoney(latestSubscription.priceMinor, latestSubscription.currency)} · aylık
                </dd>
              </div>
              <div>
                <dt>Görüşme kredisi</dt>
                <dd>{latestSubscription.credits} / 4 kaldı</dd>
              </div>
            </dl>
          ) : (
            <EmptyState
              title="Üyelik bulunmuyor"
              description="Ödeme onaylandığında paket burada görünecek."
              icon={CreditCard}
            />
          )}
        </section>
        <section className="student-panel">
          <div className="student-panel__heading">
            <div>
              <span className="eyebrow">YAKLAŞAN</span>
              <h2>Sonraki adım</h2>
            </div>
            <CalendarClock aria-hidden="true" />
          </div>
          <dl className="student-info-list">
            <div>
              <dt>Son pratik</dt>
              <dd>{historySessions[0] ? formatDateTime(historySessions[0].startAt) : '—'}</dd>
            </div>
            <div>
              <dt>Görüşme</dt>
              <dd>{formatDateTime(data.nextMeetingAt)}</dd>
            </div>
            <div>
              <dt>Kanal</dt>
              <dd>{channelLabel(data.channel)}</dd>
            </div>
          </dl>
        </section>
        <section className="student-panel student-panel--wide">
          <div className="student-panel__heading">
            <div>
              <span className="eyebrow">SON PRATİKLER</span>
              <h2>Devamlılık sinyali</h2>
            </div>
            <Activity aria-hidden="true" />
          </div>
          {historySessions.length ? (
            <div className="student-mini-list">
              {historySessions.slice(0, 6).map((session) => (
                <PracticeRow key={session.id} session={session} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Henüz pratik kaydı yok"
              description="İlk plan oluşturulduğunda oturumlar burada listelenir."
              icon={Activity}
            />
          )}
        </section>
        <section className="student-panel">
          <div className="student-panel__heading">
            <div>
              <span className="eyebrow">RİZA VE İLETİŞİM</span>
              <h2>Durum özeti</h2>
            </div>
            <ShieldCheck aria-hidden="true" />
          </div>
          <dl className="student-info-list">
            <div>
              <dt>Mesaj gönderimi</dt>
              <dd>
                {data.messagingPreference?.proactiveEnabled === false ? 'Duraklatıldı' : 'Açık'}
              </dd>
            </div>
            <div>
              <dt>Rıza kaydı</dt>
              <dd>
                {data.consents.filter((consent) => consent.status === 'GRANTED').length} aktif izin
              </dd>
            </div>
            <div>
              <dt>Tercih edilen dil</dt>
              <dd>{data.preferredLocale}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

function PracticesTab({
  data,
  planEditing,
  planForm,
  setPlanEditing,
  setPlanForm,
  savePlan,
  busy,
  setPracticeAction,
  practiceTab,
  setPracticeTab,
  onReschedule,
  onCancel,
  onRestore,
}: {
  data: Detail;
  planEditing: boolean;
  planForm: {
    morning: string;
    evening: string;
    morningActive: boolean;
    eveningActive: boolean;
    duration: string;
  };
  setPlanEditing: (value: boolean) => void;
  setPlanForm: (value: {
    morning: string;
    evening: string;
    morningActive: boolean;
    eveningActive: boolean;
    duration: string;
  }) => void;
  savePlan: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  busy: boolean;
  setPracticeAction: (value: 'pause' | 'restore') => void;
  practiceTab: 'history' | 'planned' | 'cancelled';
  setPracticeTab: (value: 'history' | 'planned' | 'cancelled') => void;
  onReschedule: (session: PracticeSession) => void;
  onCancel: (session: PracticeSession) => void;
  onRestore: (session: PracticeSession) => void;
}) {
  const plan = data.practicePlan;
  const history = data.practice.sessions
    .filter((session) =>
      ['COMPLETED', 'MISSED', 'SKIPPED', 'AWAITING_RESPONSE'].includes(session.status),
    )
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  const planned = data.practice.sessions
    .filter(
      (session) =>
        ['SCHEDULED', 'REMINDED'].includes(session.status) &&
        new Date(session.startAt).getTime() >= Date.now(),
    )
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const cancelled = data.practice.sessions
    .filter((session) => session.status === 'CANCELLED')
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  const sessions =
    practiceTab === 'history' ? history : practiceTab === 'planned' ? planned : cancelled;
  return (
    <div className="student-tab-content">
      <div className="student-section-heading">
        <div>
          <span className="eyebrow">GÜNLÜK PROGRAM</span>
          <h2>Pratik planı</h2>
          <p>Sabah ve akşam saatlerini, süreyi ve planın durumunu buradan güncelleyin.</p>
        </div>
        <div className="student-action-row">
          {plan ? (
            <Badge tone={plan.status === 'PAUSED' ? 'warning' : 'success'}>
              {label(plan.status)}
            </Badge>
          ) : null}
          {plan ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPracticeAction(plan.status === 'PAUSED' ? 'restore' : 'pause')}
            >
              {plan.status === 'PAUSED' ? (
                <Play aria-hidden="true" />
              ) : (
                <Pause aria-hidden="true" />
              )}
              {plan.status === 'PAUSED' ? 'Yeniden başlat' : 'Duraklat'}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setPlanEditing(!planEditing)}>
            <Settings2 aria-hidden="true" />
            {planEditing ? 'Vazgeç' : 'Planı düzenle'}
          </Button>
        </div>
      </div>
      {planEditing ? (
        <form className="student-plan-editor" onSubmit={savePlan}>
          <label className="student-slot-control">
            <span>Sabah</span>
            <input
              type="time"
              required={planForm.morningActive}
              disabled={!planForm.morningActive}
              value={planForm.morning}
              onChange={(event) => setPlanForm({ ...planForm, morning: event.target.value })}
            />
            <span className="student-check-label">
              <input
                type="checkbox"
                checked={planForm.morningActive}
                onChange={(event) =>
                  setPlanForm({ ...planForm, morningActive: event.target.checked })
                }
              />
              Aktif
            </span>
          </label>
          <label className="student-slot-control">
            <span>Akşam</span>
            <input
              type="time"
              required={planForm.eveningActive}
              disabled={!planForm.eveningActive}
              value={planForm.evening}
              onChange={(event) => setPlanForm({ ...planForm, evening: event.target.value })}
            />
            <span className="student-check-label">
              <input
                type="checkbox"
                checked={planForm.eveningActive}
                onChange={(event) =>
                  setPlanForm({ ...planForm, eveningActive: event.target.checked })
                }
              />
              Aktif
            </span>
          </label>
          <label>
            <span>Süre (dk)</span>
            <input
              type="number"
              min="1"
              max="180"
              required
              value={planForm.duration}
              onChange={(event) => setPlanForm({ ...planForm, duration: event.target.value })}
            />
          </label>
          <Button type="submit" loading={busy}>
            <Check aria-hidden="true" />
            Değişiklikleri yayınla
          </Button>
        </form>
      ) : plan ? (
        <div className="student-plan-slots">
          {plan.slots.map((slot) => (
            <div key={slot.id}>
              <span>{slot.slotKey === 'MORNING' ? 'Sabah' : 'Akşam'}</span>
              <strong>{slot.active ? slot.localTime : 'Kapalı'}</strong>
              <small>{slot.durationMinutes} dakika</small>
            </div>
          ))}
          <div>
            <span>Revizyon</span>
            <strong>v{plan.revision}</strong>
            <small>{formatDate(plan.effectiveFrom)} itibarıyla</small>
          </div>
        </div>
      ) : (
        <EmptyState
          title="Pratik planı yok"
          description="Aktif veya planlanmış üyelik üzerinden yeni bir plan oluşturun."
          icon={Activity}
        />
      )}

      <section className="student-table-section">
        <div className="student-section-heading student-section-heading--compact">
          <div>
            <span className="eyebrow">PRATİK KAYITLARI</span>
            <h2>
              {practiceTab === 'history'
                ? 'Oturum geçmişi'
                : practiceTab === 'planned'
                  ? 'Planlanan pratikler'
                  : 'İptal edilen pratikler'}
            </h2>
          </div>
          <span className="muted">{sessions.length} kayıt</span>
        </div>
        <div className="student-subtabs" role="tablist" aria-label="Pratik kayıt filtreleri">
          {(
            [
              ['history', 'Oturum geçmişi', history.length],
              ['planned', 'Planlanan', planned.length],
              ['cancelled', 'İptal edilen', cancelled.length],
            ] as const
          ).map(([key, text, count]) => (
            <button
              type="button"
              role="tab"
              aria-selected={practiceTab === key}
              data-active={practiceTab === key}
              key={key}
              onClick={() => setPracticeTab(key)}
            >
              {text} <small>{count}</small>
            </button>
          ))}
        </div>
        {sessions.length ? (
          <div className="student-session-list">
            {sessions.map((session) => (
              <PracticeRow
                key={session.id}
                session={session}
                onReschedule={practiceTab === 'planned' ? onReschedule : undefined}
                onCancel={practiceTab === 'planned' ? onCancel : undefined}
                onRestore={practiceTab === 'cancelled' ? onRestore : undefined}
                busy={busy}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              practiceTab === 'history'
                ? 'Oturum geçmişi boş'
                : practiceTab === 'planned'
                  ? 'Planlanan pratik yok'
                  : 'İptal edilen pratik yok'
            }
            description={
              practiceTab === 'history'
                ? 'Tamamlanan, yapılamayan veya geri dönüş alınamayan pratikler burada görünür.'
                : undefined
            }
            icon={MessageCircle}
          />
        )}
      </section>
    </div>
  );
}

function PracticeRow({
  session,
  compact = false,
  onReschedule,
  onCancel,
  onRestore,
  busy = false,
}: {
  session: PracticeSession;
  compact?: boolean;
  onReschedule?: (session: PracticeSession) => void;
  onCancel?: (session: PracticeSession) => void;
  onRestore?: (session: PracticeSession) => void;
  busy?: boolean;
}) {
  return (
    <article className={`student-session-row${compact ? ' student-session-row--compact' : ''}`}>
      <div className="student-session-date">
        <strong>{formatDate(session.serviceDate)}</strong>
        <small>
          {session.slot === 'MORNING' ? 'Sabah' : session.slot === 'EVENING' ? 'Akşam' : 'Pratik'}
        </small>
      </div>
      <div className="student-session-time">
        <strong>{formatTime(session.startAt)}</strong>
        <small>{session.durationMinutes} dk</small>
      </div>
      <Badge tone={statusTone[session.status] ?? 'neutral'}>{label(session.status)}</Badge>
      {!compact &&
      (session.reflection ||
        ['MISSED', 'SKIPPED', 'AWAITING_RESPONSE'].includes(session.status)) ? (
        <div className="student-session-reflection">
          {session.reflection?.content ? (
            <p>{session.reflection.content}</p>
          ) : session.status === 'MISSED' ? (
            <span className="muted">Geri dönüş alınmadı.</span>
          ) : session.status === 'SKIPPED' ? (
            <span className="muted">Öğrenci bugün yapamadığını bildirdi.</span>
          ) : session.status === 'AWAITING_RESPONSE' ? (
            <span className="muted">Yanıt bekleniyor.</span>
          ) : null}
          {session.reflection?.tags.length ? (
            <small>{session.reflection.tags.map((tag) => tag.tag).join(' · ')}</small>
          ) : null}
        </div>
      ) : null}
      {!compact && (onReschedule || onCancel || onRestore) ? (
        <div className="student-row-actions student-session-actions">
          {onReschedule ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onReschedule(session)}>
              <CalendarClock aria-hidden="true" />
              Saati değiştir
            </Button>
          ) : null}
          {onCancel ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onCancel(session)}>
              <XCircle aria-hidden="true" />
              İptal et
            </Button>
          ) : null}
          {onRestore ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRestore(session)}>
              <RefreshCw aria-hidden="true" />
              İptali geri al
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MeetingsTab({
  data,
  busy,
  openReschedule,
  openStatus,
  openCreate,
}: {
  data: Detail;
  busy: boolean;
  openReschedule: (meeting: Meeting) => void;
  openStatus: (meeting: Meeting, status: string) => void;
  openCreate: () => void;
}) {
  const hasSubscription = data.subscriptions.some(
    (item) => item.status === 'ACTIVE' || item.status === 'SCHEDULED',
  );
  return (
    <div className="student-tab-content">
      <div className="student-section-heading">
        <div>
          <span className="eyebrow">HAFTALIK GÖRÜŞMELER</span>
          <h2>Görüşme takvimi</h2>
          <p>Google Meet bağlantısı, durum ve saat değişikliklerini öğrenci bazında yönetin.</p>
        </div>
        {!data.meetings.length && hasSubscription ? (
          <Button onClick={openCreate}>
            <CalendarClock aria-hidden="true" />
            Seri oluştur
          </Button>
        ) : null}
      </div>
      {data.meetings.length ? (
        <div className="student-meeting-list">
          <div className="student-meeting-head">
            <span>Görüşme</span>
            <span>Zaman</span>
            <span>Durum</span>
            <span>İşlem</span>
          </div>
          {data.meetings.map((meeting) => (
            <article className="student-meeting-row" key={meeting.id}>
              <div>
                <strong>{meeting.occurrenceNumber}. görüşme</strong>
                <small>
                  {meeting.timezone} · {meeting.calendarSyncStatus}
                </small>
              </div>
              <div>
                <strong>{formatDateTime(meeting.startsAt)}</strong>
                <small>
                  {new Date(meeting.startsAt).toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  –{' '}
                  {new Date(meeting.endsAt).toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              </div>
              <div>
                <Badge tone={statusTone[meeting.status] ?? 'neutral'}>
                  {label(meeting.status)}
                </Badge>
                {meeting.meetUrl ? (
                  <a
                    className="student-meet-link"
                    href={meeting.meetUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Meet linki
                  </a>
                ) : (
                  <small className="muted">Link bekleniyor</small>
                )}
              </div>
              <div className="student-row-actions">
                {meeting.status === 'SCHEDULED' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => openReschedule(meeting)}
                  >
                    Saati değiştir
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    openStatus(meeting, meeting.status === 'SCHEDULED' ? 'COMPLETED' : 'SCHEDULED')
                  }
                >
                  {meeting.status === 'SCHEDULED' ? 'Tamamlandı' : 'Planla'}
                </Button>
                {meeting.status === 'SCHEDULED' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => openStatus(meeting, 'NO_SHOW')}
                  >
                    Katılmadı
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Görüşme planı yok"
          description={
            hasSubscription
              ? 'İlk görüşme zamanını seçerek dört haftalık seriyi oluşturun.'
              : 'Görüşme planlamak için aktif bir üyelik gerekir.'
          }
          icon={CalendarClock}
        />
      )}
    </div>
  );
}

function ConversationsTab({
  data,
  conversation,
  loading,
  error,
  onReload,
  onReply,
  onResolveHandoff,
  busy,
}: {
  data: Detail;
  conversation?: Conversation;
  loading: boolean;
  error?: string;
  onReload: () => Promise<void>;
  onReply: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onResolveHandoff: (handoffId: string, content?: string) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="student-tab-content">
      <div className="student-section-heading">
        <div>
          <span className="eyebrow">KANAL GEÇMİŞİ</span>
          <h2>Konuşma ve yanıt</h2>
          <p>{channelLabel(data.channel)} üzerinden gelen ve gönderilen mesajlar.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void onReload()} loading={loading}>
          <RefreshCw aria-hidden="true" />
          Yenile
        </Button>
      </div>
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : loading && !conversation ? (
        <Skeleton className="conversation-skeleton" />
      ) : conversation ? (
        <>
          <HandoffQueue
            handoffs={conversation.handoffs}
            messages={conversation.items}
            busy={busy}
            onResolve={onResolveHandoff}
          />
          <div className="student-conversation-layout">
            <div className="student-message-timeline">
              {conversation.items.length ? (
                conversation.items.map((item) => (
                  <MessageBubble
                    key={item.id}
                    direction={item.direction === 'OUTBOUND' ? 'outbound' : 'inbound'}
                    channel={item.status}
                    time={formatDateTime(item.occurredAt)}
                  >
                    <div>
                      {item.content ?? 'İçerik çözülemedi'}
                      {item.context?.eventKey ? (
                        <small className="message-context-label">
                          Bağlam: {item.context.eventKey} · {item.context.resolutionMethod}
                        </small>
                      ) : null}
                    </div>
                  </MessageBubble>
                ))
              ) : (
                <EmptyState
                  title="Konuşma yok"
                  description="Bu öğrenciyle henüz mesajlaşma gerçekleşmemiş."
                  icon={MessageCircle}
                />
              )}
            </div>
            <aside className="student-reply-panel">
              <div>
                <span className="eyebrow">ADMİN YANITI</span>
                <h3>Öğrenciye mesaj gönder</h3>
                <p>Mesaj varsayılan kanal üzerinden gönderim kuyruğuna alınır.</p>
              </div>
              <form onSubmit={onReply}>
                <textarea
                  name="content"
                  required
                  maxLength={4096}
                  placeholder="Samimi ve kısa bir yanıt yazın..."
                />
                <Button type="submit" loading={busy}>
                  <Send aria-hidden="true" />
                  Gönder
                </Button>
              </form>
              {conversation.intents.length ? (
                <div className="student-intent-list">
                  <strong>Gönderim sorunları</strong>
                  <small className="muted">Mesaj akışından ayrı operasyon kayıtları</small>
                  {conversation.intents.slice(0, 5).map((intent) => (
                    <div key={intent.id}>
                      <span>{label(intent.category)}</span>
                      <Badge tone={statusTone[intent.status] ?? 'neutral'}>
                        {label(intent.status)}
                      </Badge>
                      {intent.suppressionReason ? (
                        <small className="student-intent-reason">{intent.suppressionReason}</small>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}

function HandoffQueue({
  handoffs,
  messages,
  busy,
  onResolve,
}: {
  handoffs: Conversation['handoffs'];
  messages: Conversation['items'];
  busy: boolean;
  onResolve: (handoffId: string, content?: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const open = handoffs.filter((handoff) => handoff.status === 'OPEN');
  const resolved = handoffs.filter((handoff) => handoff.status === 'RESOLVED');
  return (
    <section className="student-handoff-queue">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ADMİN AKSİYONU</span>
          <h3>Handover kayıtları</h3>
        </div>
        <Badge tone={open.length ? 'warning' : 'success'}>{open.length} açık</Badge>
      </div>
      {open.length ? (
        <div className="student-handoff-list">
          {open.map((handoff) => {
            const content = drafts[handoff.id]?.trim() ?? '';
            const sourceMessage = messages.find(
              (message) => message.id === handoff.sourceMessageId,
            );
            return (
              <article key={handoff.id}>
                <div className="student-handoff-meta">
                  <LifeBuoy aria-hidden="true" />
                  <strong>Yanıt bekliyor</strong>
                  <span>{formatDateTime(handoff.createdAt)}</span>
                </div>
                <div className="student-handoff-context">
                  <strong>Öğrencinin mesajı</strong>
                  <p>{sourceMessage?.content ?? 'Kaynak mesaj içeriği görüntülenemedi.'}</p>
                  <small>Yönlendirme: {handoff.reason}</small>
                </div>
                <textarea
                  value={drafts[handoff.id] ?? ''}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [handoff.id]: event.target.value }))
                  }
                  maxLength={4096}
                  placeholder="İsterseniz öğrenciye gönderilecek mesajı yazın..."
                />
                <Button
                  type="button"
                  loading={busy}
                  onClick={() => void onResolve(handoff.id, content || undefined)}
                >
                  {content ? <Send aria-hidden="true" /> : <Check aria-hidden="true" />}
                  {content ? 'Yanıtı gönder ve kapat' : 'Mesajsız kapat'}
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">Yanıt bekleyen handover bulunmuyor.</p>
      )}
      {resolved.length ? (
        <details className="student-handoff-history">
          <summary>Çözülen handover’lar ({resolved.length})</summary>
          {resolved.map((handoff) => (
            <div key={handoff.id}>
              <span>{handoff.resolvedAt ? formatDateTime(handoff.resolvedAt) : 'Çözüldü'}</span>
              <p>{handoff.reason}</p>
            </div>
          ))}
        </details>
      ) : null}
    </section>
  );
}

function PaymentsTab({
  data,
  busy,
  approvePayment,
  openActionRequired,
}: {
  data: Detail;
  busy: boolean;
  approvePayment: (paymentId: string) => Promise<void>;
  openActionRequired: (paymentId: string) => void;
}) {
  return (
    <div className="student-tab-content">
      <div className="student-section-heading">
        <div>
          <span className="eyebrow">ÖDEME GEÇMİŞİ</span>
          <h2>Paket ve tahsilatlar</h2>
          <p>Bildirimleri, onay durumunu ve dört görüşme kredisini takip edin.</p>
        </div>
        <Badge tone="info">{data.payments.length} ödeme</Badge>
      </div>
      {data.payments.length ? (
        <div className="student-payment-list">
          {data.payments.map((payment) => (
            <article className="student-payment-row" key={payment.id}>
              <div>
                <strong>{payment.referenceCode}</strong>
                <small>
                  {formatDateTime(payment.reportedAt)} ·{' '}
                  {formatMoney(payment.amountMinor, payment.currency)}
                </small>
              </div>
              <Badge tone={statusTone[payment.status] ?? 'neutral'}>{label(payment.status)}</Badge>
              <div className="student-row-actions">
                {payment.reviewNote ? (
                  <span className="student-note">{payment.reviewNote}</span>
                ) : null}
                {['REPORTED', 'UNDER_REVIEW', 'ACTION_REQUIRED'].includes(payment.status) ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void approvePayment(payment.id)}
                    >
                      <Check aria-hidden="true" />
                      Onayla
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => openActionRequired(payment.id)}
                    >
                      Not ekle
                    </Button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Ödeme kaydı yok"
          description="Öğrencinin ödeme bildirimleri burada listelenir."
          icon={CreditCard}
        />
      )}
    </div>
  );
}

function ProfileTab({ data }: { data: Detail }) {
  return (
    <div className="student-tab-content">
      <div className="student-profile-grid">
        <section className="student-panel">
          <div className="student-panel__heading">
            <div>
              <span className="eyebrow">KİMLİK</span>
              <h2>Profil bilgileri</h2>
            </div>
            <UserRound aria-hidden="true" />
          </div>
          <dl className="student-info-list">
            <div>
              <dt>Ad soyad</dt>
              <dd>{data.fullName ?? 'İsim belirtilmedi'}</dd>
            </div>
            <div>
              <dt>Öğrenci kodu</dt>
              <dd>{data.id}</dd>
            </div>
            <div>
              <dt>Zaman dilimi</dt>
              <dd>{data.timezone}</dd>
            </div>
            <div>
              <dt>Dil</dt>
              <dd>{data.preferredLocale}</dd>
            </div>
            <div>
              <dt>Kayıt adımı</dt>
              <dd>{label(data.registrationStep)}</dd>
            </div>
            <div>
              <dt>İlerleme kaynağı</dt>
              <dd>
                {data.journey.source === 'ADMIN' ? 'Admin override' : 'Otomatik görüşme sayacı'}
              </dd>
            </div>
          </dl>
        </section>
        <section className="student-panel">
          <div className="student-panel__heading">
            <div>
              <span className="eyebrow">KANALLAR</span>
              <h2>İletişim hesapları</h2>
            </div>
            <MessageCircle aria-hidden="true" />
          </div>
          <div className="student-channel-list">
            {data.channels.length ? (
              data.channels.map((channel) => (
                <div key={channel.id}>
                  <div>
                    <strong>
                      {channel.type === 'WHATSAPP' ? 'WhatsApp' : 'Telegram'}
                      {channel.isDefault ? ' · Varsayılan' : ''}
                    </strong>
                    <small>{channel.displayName}</small>
                  </div>
                  <span>{channel.identifier ?? 'Tanımlayıcı çözülemedi'}</span>
                  <Badge tone={channel.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {label(channel.status)}
                  </Badge>
                </div>
              ))
            ) : (
              <EmptyState
                title="Kanal yok"
                description="Öğrenci henüz bir kanal bağlamadı."
                icon={MessageCircle}
              />
            )}
          </div>
        </section>
        <section className="student-panel student-panel--wide">
          <div className="student-panel__heading">
            <div>
              <span className="eyebrow">İZİNLER</span>
              <h2>KVKK ve AI izinleri</h2>
            </div>
            <ShieldCheck aria-hidden="true" />
          </div>
          {data.consents.length ? (
            <div className="student-consent-list">
              {data.consents.map((consent) => (
                <div key={`${consent.scope}-${consent.occurredAt}`}>
                  <div>
                    <strong>{consent.scope}</strong>
                    <small>
                      {consent.channel} · v{consent.textVersion} ·{' '}
                      {formatDateTime(consent.occurredAt)}
                    </small>
                  </div>
                  <Badge tone={consent.status === 'GRANTED' ? 'success' : 'warning'}>
                    {consent.status === 'GRANTED' ? 'Verildi' : 'Geri çekildi'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="İzin kaydı yok" icon={ShieldCheck} />
          )}
        </section>
        <section className="student-panel">
          <div className="student-panel__heading">
            <div>
              <span className="eyebrow">MESAJLAŞMA</span>
              <h2>Proaktif bildirimler</h2>
            </div>
            <Settings2 aria-hidden="true" />
          </div>
          <dl className="student-info-list">
            <div>
              <dt>Hatırlatmalar</dt>
              <dd>{data.messagingPreference?.proactiveEnabled === false ? 'Kapalı' : 'Açık'}</dd>
            </div>
            <div>
              <dt>Durum</dt>
              <dd>
                {data.messagingPreference?.pausedAt
                  ? `${formatDateTime(data.messagingPreference.pausedAt)} tarihinde duraklatıldı`
                  : 'Normal'}
              </dd>
            </div>
            <div>
              <dt>Not</dt>
              <dd>{data.messagingPreference?.pauseReason ?? '—'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

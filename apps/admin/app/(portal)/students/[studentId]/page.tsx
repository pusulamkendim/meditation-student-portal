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
  Copy,
  Eye,
  FileText,
  MessageCircle,
  LifeBuoy,
  NotebookPen,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Smartphone,
  Sparkles,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import type { CSSProperties, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  allPracticeWeekdays,
  formatPracticeWeekdays,
  PracticeWeekdaySelector,
} from '../../../_components/practice-weekday-selector';
import { VoiceAudioPlayer, type VoiceMediaSummary } from '../../../_components/voice-audio-player';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type Subscription = {
  id: string;
  status: string;
  startDate: string;
  endExclusive: string;
  priceMinor: string;
  currency: string;
  credits: number;
  version: number;
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
  meditationType?: { id: string; title: string };
  meditationRender?: {
    id: string;
    status: string;
    durationMinutes: number;
    sourceVersion: number;
  };
  reflection?: {
    content?: string;
    createdAt: string;
    tags: Array<{ tag: string; confidence: number }>;
    voiceMedia?: VoiceMediaSummary;
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
    activeWeekdays: number[];
    slots: Array<{
      id: string;
      slotKey: string;
      localTime: string;
      durationMinutes: number;
      active: boolean;
      meditationType?: { id: string; title: string; status: string };
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
  openHandoffCount: number;
  noteCount: number;
};

type MeditationOption = {
  id: string;
  title: string;
  status: string;
  targetDurations: number[];
};

type PracticePlanForm = {
  morning: string;
  evening: string;
  morningActive: boolean;
  eveningActive: boolean;
  morningMeditationTypeId: string;
  eveningMeditationTypeId: string;
  morningDuration: string;
  eveningDuration: string;
  activeWeekdays: number[];
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

type WhatsAppNumberTransfer = {
  id: string;
  command: string;
  expiresAt: string;
  url: string;
  previousDefaultIdentityId?: string;
};

type WhatsAppNumberTransferStatus = {
  id?: string;
  status: 'NONE' | 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'REVOKED';
  createdAt?: string;
  expiresAt?: string;
  usedAt?: string;
  revokedAt?: string;
};

type Conversation = {
  items: Array<{
    id: string;
    direction: string;
    status: string;
    occurredAt: string;
    content?: string;
    voiceMedia?: VoiceMediaSummary;
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

type StudentNote = {
  id: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type StudentReport = {
  id: string;
  studentId: string;
  type: 'WEEKLY' | 'MONTHLY';
  periodStart: string;
  periodEndExclusive: string;
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  aiStatus: 'NOT_REQUESTED' | 'PENDING' | 'READY' | 'FAILED';
  snapshot: {
    period: { start: string; endExclusive: string; durationDays: number };
    practice: {
      current: {
        planned: number;
        completed: number;
        skipped: number;
        missed: number;
        awaitingResponse: number;
        reflections: number;
        completionRate: number;
        reflectionRate: number;
      };
      previous: { planned: number; completed: number; completionRate: number };
      completionRateChange: number;
      maxCompletedDayStreak: number;
      days: Array<{
        date: string;
        sessions: Array<{ id: string; slot: string; status: string; durationMinutes: number }>;
      }>;
    };
    subscription?: { packageWeek?: number } | null;
    meetings: Array<{ id: string; startsAt: string; status: string }>;
  };
  content: {
    subtitle: string;
    featuredReflectionId: string | null;
    featuredReflectionQuote?: string;
    gentleObservation: { text: string; evidenceRefs: string[] };
    supportPoint: { text: string; evidenceRefs: string[] };
    weeklyEvaluation: { text: string; evidenceRefs: string[] };
    internal: { confidence: number; insufficientEvidence: boolean; safetyConcern: boolean };
  };
  version: number;
  approvedAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  reflectionCandidates?: Array<{
    id: string;
    date: string;
    slot: string;
    meditationType?: string | null;
    text: string;
  }>;
  share?: {
    status: string;
    expiresAt?: string;
    viewCount: number;
    firstOpenedAt?: string;
    lastOpenedAt?: string;
    publicUrl?: string;
    messageIntentId?: string;
    lastSentAt?: string;
    sendCount: number;
  } | null;
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
const intentLabels: Record<string, string> = {
  PRACTICE_CHECKIN: 'Pratik geri bildirimi',
  PRACTICE_REMINDER: 'Pratik hatırlatması',
  MEETING_REMINDER: 'Görüşme hatırlatması',
  ADMIN_REPLY: 'Admin yanıtı',
  SYSTEM_STANDARD_MESSAGE: 'Sistem mesajı',
};
const suppressionLabels: Record<string, string> = {
  WHATSAPP_TEMPLATE_REQUIRED: 'WhatsApp 24 saat penceresi kapalı; onaylı template gerekli.',
  STUDENT_INACTIVE: 'Öğrenci aktif olmadığı için gönderilmedi.',
  PROACTIVE_MESSAGING_PAUSED: 'Öğrencinin proaktif mesajları duraklatılmış.',
};

function formatDate(value?: string) {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

function formatInclusiveEndDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() - 1);
  return dateFormatter.format(date);
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

function preferredSubscription(subscriptions: Subscription[]) {
  return (
    subscriptions.find((subscription) => subscription.status === 'ACTIVE') ??
    subscriptions.find((subscription) => subscription.status === 'SCHEDULED') ??
    subscriptions[0]
  );
}

function packageSourceSubscription(subscriptions: Subscription[]) {
  return subscriptions
    .filter((subscription) => ['ACTIVE', 'SCHEDULED'].includes(subscription.status))
    .sort(
      (left, right) =>
        new Date(right.endExclusive).getTime() - new Date(left.endExclusive).getTime(),
    )[0];
}

function addUtcDays(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minimumSubscriptionEnd(subscription: Subscription) {
  const afterStart = addUtcDays(subscription.startDate, 1);
  const tomorrow = addUtcDays(new Date().toISOString(), 1);
  return afterStart > tomorrow ? afterStart : tomorrow;
}

export default function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<Detail>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [activeTab, setActiveTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [planEditing, setPlanEditing] = useState(false);
  const [planForm, setPlanForm] = useState<PracticePlanForm>({
    morning: '08:00',
    evening: '21:00',
    morningActive: true,
    eveningActive: true,
    morningMeditationTypeId: '',
    eveningMeditationTypeId: '',
    morningDuration: '15',
    eveningDuration: '15',
    activeWeekdays: [...allPracticeWeekdays],
  });
  const [meditationOptions, setMeditationOptions] = useState<MeditationOption[]>([]);
  const [practiceAction, setPracticeAction] = useState<'pause' | 'restore'>();
  const [practiceReason, setPracticeReason] = useState('');
  const [practiceTab, setPracticeTab] = useState<'history' | 'planned' | 'cancelled'>('history');
  const [practiceDialog, setPracticeDialog] = useState<'reschedule' | 'cancel' | 'restore'>();
  const [selectedPractice, setSelectedPractice] = useState<PracticeSession>();
  const [practiceDate, setPracticeDate] = useState('');
  const [practiceOutcomeOpen, setPracticeOutcomeOpen] = useState(false);
  const [practiceOutcome, setPracticeOutcome] = useState<'COMPLETED' | 'SKIPPED' | 'MISSED'>(
    'COMPLETED',
  );
  const [practiceReflection, setPracticeReflection] = useState('');
  const [practiceOutcomeReason, setPracticeOutcomeReason] = useState(
    'Pratik kaydı admin tarafından güncellendi.',
  );
  const [meetingDialog, setMeetingDialog] = useState<'create' | 'reschedule' | 'status'>();
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting>();
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingSubscriptionId, setMeetingSubscriptionId] = useState('');
  const [meetingReason, setMeetingReason] = useState('');
  const [meetingTargetStatus, setMeetingTargetStatus] = useState('COMPLETED');
  const [conversation, setConversation] = useState<Conversation>();
  const [conversationError, setConversationError] = useState<string>();
  const [conversationLoading, setConversationLoading] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<'note'>();
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>();
  const [paymentNote, setPaymentNote] = useState('');
  const [notes, setNotes] = useState<StudentNote[]>();
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string>();
  const [noteDialog, setNoteDialog] = useState<'create' | 'edit' | 'delete'>();
  const [selectedNote, setSelectedNote] = useState<StudentNote>();
  const [noteContent, setNoteContent] = useState('');
  const [subscriptionDialog, setSubscriptionDialog] = useState(false);
  const [subscriptionEndDate, setSubscriptionEndDate] = useState('');
  const [subscriptionReason, setSubscriptionReason] = useState(
    'Üyelik dönemi admin tarafından güncellendi.',
  );
  const [newSubscriptionDialog, setNewSubscriptionDialog] = useState(false);
  const [newSubscriptionStartDate, setNewSubscriptionStartDate] = useState('');
  const [whatsAppTransferOpen, setWhatsAppTransferOpen] = useState(false);
  const [whatsAppTransfer, setWhatsAppTransfer] = useState<WhatsAppNumberTransfer>();
  const [whatsAppTransferStatus, setWhatsAppTransferStatus] =
    useState<WhatsAppNumberTransferStatus>();
  const [whatsAppTransferError, setWhatsAppTransferError] = useState<string>();

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
        morningMeditationTypeId:
          slots.find((slot) => slot.slotKey === 'MORNING')?.meditationType?.id ?? '',
        eveningMeditationTypeId:
          slots.find((slot) => slot.slotKey === 'EVENING')?.meditationType?.id ?? '',
        morningDuration: String(
          slots.find((slot) => slot.slotKey === 'MORNING')?.durationMinutes ?? 15,
        ),
        eveningDuration: String(
          slots.find((slot) => slot.slotKey === 'EVENING')?.durationMinutes ?? 15,
        ),
        activeWeekdays: value.practicePlan?.activeWeekdays ?? [...allPracticeWeekdays],
      });
      return value;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Öğrenci yüklenemedi');
    }
  }, [studentId]);

  async function openWhatsAppNumberTransfer() {
    setWhatsAppTransferOpen(true);
    setWhatsAppTransferError(undefined);
    await refreshWhatsAppNumberTransferStatus();
  }

  async function refreshWhatsAppNumberTransferStatus() {
    try {
      setBusy(true);
      const result = await requestJson<WhatsAppNumberTransferStatus>(
        `/v1/admin/students/${studentId}/channel-links/status?channel=WHATSAPP`,
      );
      setWhatsAppTransferStatus(result);
      setWhatsAppTransfer((current) =>
        current && current.id === result.id && result.status === 'PENDING' ? current : undefined,
      );
      return result;
    } catch (reason) {
      setWhatsAppTransferError(
        reason instanceof Error ? reason.message : 'Doğrulama durumu alınamadı.',
      );
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function createWhatsAppNumberTransfer() {
    setWhatsAppTransferError(undefined);
    try {
      setBusy(true);
      const result = await requestJson<{
        id: string;
        command: string;
        expiresAt: string;
      }>(`/v1/admin/students/${studentId}/channel-links`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ channel: 'WHATSAPP' }),
      });
      const number = (process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER ?? '905428078429').replace(
        /\D/gu,
        '',
      );
      setWhatsAppTransfer({
        ...result,
        url: `https://wa.me/${number}?text=${encodeURIComponent(result.command)}`,
        previousDefaultIdentityId: data?.channel?.id,
      });
      setWhatsAppTransferStatus({
        id: result.id,
        status: 'PENDING',
        expiresAt: result.expiresAt,
      });
    } catch (reason) {
      setWhatsAppTransferError(
        reason instanceof Error ? reason.message : 'Doğrulama bağlantısı oluşturulamadı.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkWhatsAppNumberTransfer() {
    try {
      setBusy(true);
      const [refreshed, transferStatus] = await Promise.all([
        load(),
        requestJson<WhatsAppNumberTransferStatus>(
          `/v1/admin/students/${studentId}/channel-links/status?channel=WHATSAPP`,
        ),
      ]);
      setWhatsAppTransferStatus(transferStatus);
      setWhatsAppTransfer((current) =>
        current && current.id === transferStatus.id && transferStatus.status === 'PENDING'
          ? current
          : undefined,
      );
      if (
        transferStatus.status === 'CONFIRMED' ||
        (whatsAppTransfer &&
          refreshed?.channel?.type === 'WHATSAPP' &&
          refreshed.channel.id !== whatsAppTransfer.previousDefaultIdentityId)
      ) {
        setWhatsAppTransferOpen(false);
        setWhatsAppTransfer(undefined);
        setNotice('Yeni WhatsApp numarası doğrulandı ve varsayılan kanal olarak ayarlandı.');
        return;
      }
      setNotice('Yeni numaradan doğrulama mesajı henüz alınmadı.');
    } catch (reason) {
      setWhatsAppTransferError(
        reason instanceof Error ? reason.message : 'Doğrulama durumu alınamadı.',
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void requestJson<MeditationOption[]>('/v1/admin/meditations')
      .then((items) => setMeditationOptions(items.filter((item) => item.status === 'PUBLISHED')))
      .catch(() => setMeditationOptions([]));
  }, []);

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
    if (['conversations', 'handoffs'].includes(activeTab) && !conversation && !conversationLoading)
      void loadConversation();
  }, [activeTab, conversation, conversationLoading, loadConversation]);

  const loadNotes = useCallback(async () => {
    try {
      setNotesLoading(true);
      setNotesError(undefined);
      const value = await requestJson<{ items: StudentNote[] }>(
        `/v1/admin/students/${studentId}/notes`,
      );
      setNotes(value.items);
    } catch (reason) {
      setNotesError(reason instanceof Error ? reason.message : 'Notlar yüklenemedi');
    } finally {
      setNotesLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (activeTab === 'notes' && !notes && !notesLoading) void loadNotes();
  }, [activeTab, loadNotes, notes, notesLoading]);

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
    const subscription = data ? preferredSubscription(data.subscriptions) : undefined;
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
            {
              slotKey: 'MORNING',
              localTime: planForm.morning,
              active: planForm.morningActive,
              durationMinutes: Number(planForm.morningDuration),
              meditationTypeId: planForm.morningMeditationTypeId || null,
            },
            {
              slotKey: 'EVENING',
              localTime: planForm.evening,
              active: planForm.eveningActive,
              durationMinutes: Number(planForm.eveningDuration),
              meditationTypeId: planForm.eveningMeditationTypeId || null,
            },
          ],
          activeWeekdays: planForm.activeWeekdays,
        }),
      },
      'Pratik planı güncellendi.',
    );
    setPlanEditing(false);
  }

  function openSubscriptionDialog() {
    const subscription = data ? preferredSubscription(data.subscriptions) : undefined;
    if (!subscription) return;
    setSubscriptionEndDate(subscription.endExclusive.slice(0, 10));
    setSubscriptionReason('Üyelik dönemi admin tarafından güncellendi.');
    setSubscriptionDialog(true);
  }

  async function submitSubscriptionEnd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subscription = data ? preferredSubscription(data.subscriptions) : undefined;
    if (!subscription || !subscriptionEndDate || !subscriptionReason.trim()) return;
    try {
      setBusy(true);
      await requestJson(`/v1/admin/subscriptions/${subscription.id}/end-date`, {
        method: 'PATCH',
        headers: csrfHeaders(),
        body: JSON.stringify({
          endExclusive: subscriptionEndDate,
          expectedVersion: subscription.version,
          reason: subscriptionReason.trim(),
        }),
      });
      setNotice('Üyelik bitiş tarihi güncellendi.');
      setSubscriptionDialog(false);
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Üyelik güncellenemedi.');
    } finally {
      setBusy(false);
    }
  }

  function openNewSubscriptionDialog() {
    const source = data ? packageSourceSubscription(data.subscriptions) : undefined;
    const today = localDateInput(new Date());
    const defaultStart = source?.endExclusive.slice(0, 10) ?? today;
    setNewSubscriptionStartDate(defaultStart > today ? defaultStart : today);
    setNewSubscriptionDialog(true);
  }

  async function submitNewSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newSubscriptionStartDate) return;
    try {
      setBusy(true);
      await requestJson(`/v1/admin/students/${studentId}/subscriptions`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ startDate: newSubscriptionStartDate }),
      });
      setNotice(
        'Yeni 28 günlük paket ve onaylı ödeme kaydı oluşturuldu. Pratik planı yeni döneme uzatıldı.',
      );
      setNewSubscriptionDialog(false);
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Yeni paket oluşturulamadı.');
    } finally {
      setBusy(false);
    }
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

  function openPracticeOutcome(session: PracticeSession) {
    setSelectedPractice(session);
    setPracticeOutcome(
      ['COMPLETED', 'SKIPPED', 'MISSED'].includes(session.status)
        ? (session.status as 'COMPLETED' | 'SKIPPED' | 'MISSED')
        : 'COMPLETED',
    );
    setPracticeReflection(session.reflection?.content ?? '');
    setPracticeOutcomeReason('Pratik kaydı admin tarafından güncellendi.');
    setPracticeOutcomeOpen(true);
  }

  function closePracticeOutcome() {
    setPracticeOutcomeOpen(false);
    setSelectedPractice(undefined);
    setPracticeReflection('');
  }

  async function submitPracticeOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPractice || !practiceOutcomeReason.trim()) return;
    try {
      setBusy(true);
      await requestJson(`/v1/admin/practice-sessions/${selectedPractice.id}/outcome`, {
        method: 'PATCH',
        headers: csrfHeaders(),
        body: JSON.stringify({
          status: practiceOutcome,
          expectedVersion: selectedPractice.version,
          reflection:
            practiceOutcome === 'COMPLETED' ? practiceReflection.trim() || null : undefined,
          reason: practiceOutcomeReason.trim(),
        }),
      });
      setNotice('Pratik durumu güncellendi.');
      closePracticeOutcome();
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Pratik durumu güncellenemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (meetingDialog === 'create') {
      const subscription = data?.subscriptions.find((item) => item.id === meetingSubscriptionId);
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

  function openNoteDialog(mode: 'create' | 'edit' | 'delete', note?: StudentNote) {
    setSelectedNote(note);
    setNoteContent(mode === 'edit' ? (note?.content ?? '') : '');
    setNoteDialog(mode);
  }

  function closeNoteDialog() {
    setNoteDialog(undefined);
    setSelectedNote(undefined);
    setNoteContent('');
  }

  async function saveStudentNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = noteContent.trim();
    if (!content || (noteDialog === 'edit' && !selectedNote)) return;
    try {
      setBusy(true);
      await requestJson(
        noteDialog === 'edit'
          ? `/v1/admin/students/${studentId}/notes/${selectedNote!.id}`
          : `/v1/admin/students/${studentId}/notes`,
        {
          method: noteDialog === 'edit' ? 'PATCH' : 'POST',
          headers: csrfHeaders(),
          body: JSON.stringify({
            content,
            ...(selectedNote ? { version: selectedNote.version } : {}),
          }),
        },
      );
      setNotice(noteDialog === 'edit' ? 'Not güncellendi.' : 'Not eklendi.');
      closeNoteDialog();
      await Promise.all([loadNotes(), load()]);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Not kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteStudentNote() {
    if (!selectedNote) return;
    try {
      setBusy(true);
      await requestJson(`/v1/admin/students/${studentId}/notes/${selectedNote.id}`, {
        method: 'DELETE',
        headers: csrfHeaders(),
        body: JSON.stringify({ version: selectedNote.version }),
      });
      setNotice('Not silindi.');
      closeNoteDialog();
      await Promise.all([loadNotes(), load()]);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Not silinemedi.');
    } finally {
      setBusy(false);
    }
  }

  const tabs = useMemo(
    () => [
      { key: 'overview', label: 'Genel bakış', icon: Activity },
      { key: 'practices', label: 'Pratikler', icon: Clock3, count: data?.practice.sessions.length },
      { key: 'meetings', label: 'Görüşmeler', icon: CalendarClock, count: data?.meetings.length },
      { key: 'conversations', label: 'Konuşmalar', icon: MessageCircle },
      {
        key: 'handoffs',
        label: 'Handover',
        icon: LifeBuoy,
        count: data?.openHandoffCount,
      },
      { key: 'notes', label: 'Notlar', icon: NotebookPen, count: data?.noteCount },
      { key: 'reports', label: 'Karneler', icon: FileText },
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

  const currentSubscription = preferredSubscription(data.subscriptions);

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
          <strong>{currentSubscription ? label(currentSubscription.status) : 'Paket yok'}</strong>
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

      {activeTab === 'overview' ? (
        <Overview
          data={data}
          onOpenHandoffs={() => setActiveTab('handoffs')}
          onEditSubscription={openSubscriptionDialog}
          onCreateSubscription={openNewSubscriptionDialog}
        />
      ) : null}
      {activeTab === 'practices' ? (
        <PracticesTab
          data={data}
          planEditing={planEditing}
          planForm={planForm}
          meditationOptions={meditationOptions}
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
          onEditOutcome={openPracticeOutcome}
        />
      ) : null}
      {activeTab === 'meetings' ? (
        <MeetingsTab
          data={data}
          busy={busy}
          openReschedule={openReschedule}
          openStatus={openStatus}
          openCreate={() => {
            const usedSubscriptionIds = new Set(
              data.meetings.map((meeting) => meeting.subscriptionId),
            );
            const eligible = data.subscriptions.filter(
              (subscription) =>
                ['ACTIVE', 'SCHEDULED'].includes(subscription.status) &&
                !usedSubscriptionIds.has(subscription.id),
            );
            setMeetingSubscriptionId(
              eligible.find((subscription) => subscription.status === 'SCHEDULED')?.id ??
                eligible[0]?.id ??
                '',
            );
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
          busy={busy}
        />
      ) : null}
      {activeTab === 'handoffs' ? (
        <HandoffsTab
          conversation={conversation}
          loading={conversationLoading}
          error={conversationError}
          onReload={loadConversation}
          onResolveHandoff={resolveHandoff}
          busy={busy}
        />
      ) : null}
      {activeTab === 'notes' ? (
        <NotesTab
          notes={notes}
          loading={notesLoading}
          error={notesError}
          onReload={loadNotes}
          onCreate={() => openNoteDialog('create')}
          onEdit={(note) => openNoteDialog('edit', note)}
          onDelete={(note) => openNoteDialog('delete', note)}
        />
      ) : null}
      {activeTab === 'reports' ? (
        <ReportsTab studentId={studentId} studentName={data.fullName ?? 'Öğrenci'} />
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
      {activeTab === 'profile' ? (
        <ProfileTab data={data} onChangeWhatsApp={() => void openWhatsAppNumberTransfer()} />
      ) : null}

      {notice ? (
        <Toast tone="info" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Toast>
      ) : null}

      {whatsAppTransferOpen ? (
        <Modal
          title="WhatsApp numarasını değiştir"
          description="Bağlantı 24 saat geçerlidir. Öğrenci bağlantıyı yeni telefonunda açıp hazır mesajı göndererek numarasını doğrular."
          onClose={() => setWhatsAppTransferOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setWhatsAppTransferOpen(false)}>
                Kapat
              </Button>
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => void checkWhatsAppNumberTransfer()}
              >
                <RefreshCw aria-hidden="true" /> Durumu kontrol et
              </Button>
            </>
          }
        >
          <div className="student-channel-transfer">
            <Alert tone="info" title="Yeni numaradan doğrulama gerekir">
              Bu bağlantıyı öğrenciye e-posta, SMS veya güvendiğiniz başka bir kanal üzerinden
              iletin. Eski WhatsApp numarasına göndermeyin.
            </Alert>
            {whatsAppTransferError ? (
              <Alert tone="danger" title="Bağlantı oluşturulamadı">
                {whatsAppTransferError}
              </Alert>
            ) : null}
            {!whatsAppTransfer && whatsAppTransferStatus?.status === 'PENDING' ? (
              <Alert tone="info" title="Aktif doğrulama bağlantısı var">
                Mevcut bağlantı{' '}
                {whatsAppTransferStatus.expiresAt
                  ? formatDateTime(whatsAppTransferStatus.expiresAt)
                  : 'belirtilen süreye'}{' '}
                kadar geçerli. Güvenlik nedeniyle bağlantı metni tekrar gösterilmez. Yeni bağlantı
                oluşturursanız önceki bağlantı geçersiz olur.
              </Alert>
            ) : null}
            {whatsAppTransfer ? (
              <>
                <div className="student-channel-transfer__link">
                  <span>Öğrenci bağlantısı</span>
                  <strong>{whatsAppTransfer.url}</strong>
                  <small>
                    Son kullanım: {formatDateTime(whatsAppTransfer.expiresAt)}. Bağlantı yalnızca
                    bir kez kullanılabilir.
                  </small>
                </div>
                <div className="student-action-row">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard.writeText(whatsAppTransfer.url);
                      setNotice('WhatsApp doğrulama bağlantısı panoya kopyalandı.');
                    }}
                  >
                    <Copy aria-hidden="true" /> Bağlantıyı kopyala
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      window.open(whatsAppTransfer.url, '_blank', 'noopener,noreferrer')
                    }
                  >
                    <MessageCircle aria-hidden="true" /> WhatsApp'ta aç
                  </Button>
                </div>
              </>
            ) : busy ? (
              <Skeleton className="student-detail-skeleton" />
            ) : (
              <div className="student-action-row">
                <Button onClick={() => void createWhatsAppNumberTransfer()}>
                  <Smartphone aria-hidden="true" />
                  {whatsAppTransferStatus?.status === 'PENDING'
                    ? 'Yeni bağlantı oluştur'
                    : 'Bağlantı oluştur'}
                </Button>
              </div>
            )}
          </div>
        </Modal>
      ) : null}

      {subscriptionDialog && currentSubscription ? (
        <Modal
          title="Üyelik bitiş tarihini değiştir"
          description="Yeni tarih gelecek pratik takvimini günceller. Geçmiş kayıtlar korunur."
          onClose={() => setSubscriptionDialog(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setSubscriptionDialog(false)}>
                Vazgeç
              </Button>
              <Button form="subscription-end-form" type="submit" loading={busy}>
                Tarihi güncelle
              </Button>
            </>
          }
        >
          <form
            id="subscription-end-form"
            className="student-modal-form"
            onSubmit={submitSubscriptionEnd}
          >
            <label>
              <span>Üyelik bitiş tarihi</span>
              <input
                required
                type="date"
                min={minimumSubscriptionEnd(currentSubscription)}
                value={subscriptionEndDate}
                onChange={(event) => setSubscriptionEndDate(event.target.value)}
              />
            </label>
            <label>
              <span>Değişiklik nedeni</span>
              <textarea
                required
                maxLength={500}
                value={subscriptionReason}
                onChange={(event) => setSubscriptionReason(event.target.value)}
              />
            </label>
          </form>
        </Modal>
      ) : null}

      {newSubscriptionDialog ? (
        <Modal
          title="Yeni paket oluştur"
          description="Yeni dönem 28 gün sürer, dört görüşme hakkı ve onaylı 4.000 TL ödeme kaydı oluşturur. Mevcut pratik programı öğrenciye ek plan mesajı göndermeden devam eder."
          onClose={() => setNewSubscriptionDialog(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setNewSubscriptionDialog(false)}>
                Vazgeç
              </Button>
              <Button form="new-subscription-form" type="submit" loading={busy}>
                <Plus aria-hidden="true" /> Paketi oluştur
              </Button>
            </>
          }
        >
          <form
            id="new-subscription-form"
            className="student-modal-form"
            onSubmit={submitNewSubscription}
          >
            <label>
              <span>Yeni dönem başlangıcı</span>
              <input
                required
                type="date"
                min={localDateInput(new Date())}
                value={newSubscriptionStartDate}
                onChange={(event) => setNewSubscriptionStartDate(event.target.value)}
              />
            </label>
            <dl className="student-info-list">
              <div>
                <dt>Dönem</dt>
                <dd>
                  {newSubscriptionStartDate
                    ? `${formatDate(`${newSubscriptionStartDate}T00:00:00.000Z`)} – ${formatInclusiveEndDate(`${addUtcDays(newSubscriptionStartDate, 28)}T00:00:00.000Z`)}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Paket</dt>
                <dd>4.000 TL · 28 gün · 4 görüşme</dd>
              </div>
              <div>
                <dt>Ödeme kaydı</dt>
                <dd>Admin onaylı olarak oluşturulacak</dd>
              </div>
              <div>
                <dt>Pratik programı</dt>
                <dd>{data.practicePlan ? 'Yeni döneme kopyalanacak' : 'Henüz plan bulunmuyor'}</dd>
              </div>
            </dl>
          </form>
        </Modal>
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

      {practiceOutcomeOpen && selectedPractice ? (
        <Modal
          title="Pratik kaydını düzenle"
          description="Durumu ve öğrenci tarafından paylaşılan refleksiyonu aynı kayıtta yönetin."
          onClose={closePracticeOutcome}
          actions={
            <>
              <Button variant="ghost" onClick={closePracticeOutcome}>
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
                value={practiceOutcomeReason}
                onChange={(event) => setPracticeOutcomeReason(event.target.value)}
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
            {meetingDialog === 'create' ? (
              <label>
                <span>Görüşme paketi</span>
                <select
                  required
                  value={meetingSubscriptionId}
                  onChange={(event) => setMeetingSubscriptionId(event.target.value)}
                >
                  <option value="" disabled>
                    Dönem seçin
                  </option>
                  {data.subscriptions
                    .filter(
                      (subscription) =>
                        ['ACTIVE', 'SCHEDULED'].includes(subscription.status) &&
                        !data.meetings.some(
                          (meeting) => meeting.subscriptionId === subscription.id,
                        ),
                    )
                    .map((subscription) => (
                      <option key={subscription.id} value={subscription.id}>
                        {subscription.status === 'SCHEDULED' ? 'Yeni dönem' : 'Aktif dönem'} ·{' '}
                        {formatDate(subscription.startDate)} –{' '}
                        {formatInclusiveEndDate(subscription.endExclusive)}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
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

      {noteDialog === 'create' || noteDialog === 'edit' ? (
        <Modal
          title={noteDialog === 'edit' ? 'Notu düzenle' : 'Yeni öğrenci notu'}
          description="Bu not yalnızca yönetim portalında görünür."
          onClose={closeNoteDialog}
          actions={
            <>
              <Button variant="ghost" onClick={closeNoteDialog}>
                Vazgeç
              </Button>
              <Button form="student-note-form" type="submit" loading={busy}>
                Kaydet
              </Button>
            </>
          }
        >
          <form id="student-note-form" className="student-modal-form" onSubmit={saveStudentNote}>
            <label>
              <span>Not</span>
              <textarea
                required
                autoFocus
                maxLength={5000}
                rows={7}
                value={noteContent}
                onChange={(event) => setNoteContent(event.target.value)}
                placeholder="Öğrencinin güncel durumu, takip edilmesi gereken konu veya görüşme notu..."
              />
              <small className="student-note-counter">{noteContent.length} / 5000</small>
            </label>
          </form>
        </Modal>
      ) : null}

      {noteDialog === 'delete' && selectedNote ? (
        <Modal
          title="Notu sil"
          description="Bu işlem geri alınamaz."
          onClose={closeNoteDialog}
          actions={
            <>
              <Button variant="ghost" onClick={closeNoteDialog}>
                Vazgeç
              </Button>
              <Button variant="danger" loading={busy} onClick={() => void deleteStudentNote()}>
                Sil
              </Button>
            </>
          }
        >
          <p className="student-note-delete-preview">{selectedNote.content}</p>
        </Modal>
      ) : null}
    </main>
  );
}

function ReportsTab({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [reports, setReports] = useState<StudentReport[]>();
  const [selected, setSelected] = useState<StudentReport>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [period, setPeriod] = useState(defaultReportPeriod);
  const [publicUrl, setPublicUrl] = useState<string>();

  const loadDetail = useCallback(async (reportId: string) => {
    const detail = await requestJson<StudentReport>(`/v1/admin/student-reports/${reportId}`);
    setSelected(detail);
    setPublicUrl(detail.share?.status === 'ACTIVE' ? detail.share.publicUrl : undefined);
    return detail;
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(undefined);
      const result = await requestJson<{ items: StudentReport[] }>(
        `/v1/admin/students/${studentId}/reports`,
      );
      setReports(result.items);
      return result.items;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Karneler yüklenemedi.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadReports().then((items) => {
      if (items[0]) void loadDetail(items[0].id);
    });
  }, [loadDetail, loadReports]);

  useEffect(() => {
    if (!selected || selected.aiStatus !== 'PENDING') return;
    const timer = window.setInterval(() => {
      void loadDetail(selected.id).then((value) => {
        if (value.aiStatus !== 'PENDING') {
          setNotice(
            value.aiStatus === 'READY' ? 'AI karne taslağı hazır.' : 'AI taslağı üretilemedi.',
          );
          void loadReports();
        }
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [loadDetail, loadReports, selected?.aiStatus, selected?.id]);

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setBusy(true);
      const created = await requestJson<StudentReport>(`/v1/admin/students/${studentId}/reports`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          type: 'WEEKLY',
          periodStart: period.start,
          periodEndExclusive: period.endExclusive,
        }),
      });
      setCreateOpen(false);
      setNotice('Karne taslağı oluşturuldu.');
      await loadReports();
      await loadDetail(created.id);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Karne oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function saveReport() {
    if (!selected) return;
    try {
      setBusy(true);
      const updated = await requestJson<StudentReport>(`/v1/admin/student-reports/${selected.id}`, {
        method: 'PATCH',
        headers: csrfHeaders(),
        body: JSON.stringify({
          version: selected.version,
          subtitle: selected.content.subtitle,
          featuredReflectionId: selected.content.featuredReflectionId,
          gentleObservation: selected.content.gentleObservation.text,
          supportPoint: selected.content.supportPoint.text,
          weeklyEvaluation: selected.content.weeklyEvaluation.text,
        }),
      });
      setNotice('Karne taslağı kaydedildi.');
      await loadDetail(updated.id);
      await loadReports();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Karne kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function generateAi() {
    if (!selected) return;
    try {
      setBusy(true);
      await requestJson(`/v1/admin/student-reports/${selected.id}/generate-ai`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({}),
      });
      await loadDetail(selected.id);
      setNotice('AI karne taslağı kuyruğa alındı.');
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'AI taslağı başlatılamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function approveReport() {
    if (!selected) return;
    try {
      setBusy(true);
      const updated = await requestJson<StudentReport>(
        `/v1/admin/student-reports/${selected.id}/approve`,
        {
          method: 'POST',
          headers: csrfHeaders(),
          body: JSON.stringify({
            version: selected.version,
            acknowledgeSafety: selected.content.internal.safetyConcern,
          }),
        },
      );
      setNotice('Karne onaylandı. Artık özel bağlantı oluşturabilirsiniz.');
      await loadDetail(updated.id);
      await loadReports();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Karne onaylanamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function createShare() {
    if (!selected) return;
    try {
      setBusy(true);
      const value = await requestJson<{ publicUrl: string }>(
        `/v1/admin/student-reports/${selected.id}/share`,
        {
          method: 'POST',
          headers: csrfHeaders(),
          body: JSON.stringify({ expiresAt: null }),
        },
      );
      setPublicUrl(value.publicUrl);
      await navigator.clipboard.writeText(value.publicUrl).catch(() => undefined);
      setNotice('Özel bağlantı oluşturuldu ve panoya kopyalandı. Önceki bağlantı geçersizdir.');
      await loadDetail(selected.id);
      await loadReports();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Paylaşım bağlantısı oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function sendShare() {
    if (!selected) return;
    try {
      setBusy(true);
      const value = await requestJson<{ queued: boolean; channel: string }>(
        `/v1/admin/student-reports/${selected.id}/share/send`,
        {
          method: 'POST',
          headers: csrfHeaders(),
          body: JSON.stringify({}),
        },
      );
      const channel = value.channel === 'WHATSAPP' ? 'WhatsApp' : 'Telegram';
      setNotice(`Karne bağlantısı ${channel} gönderim kuyruğuna alındı.`);
      await loadDetail(selected.id);
      await loadReports();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Karne öğrenciyle paylaşılamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeShare() {
    if (!selected) return;
    try {
      setBusy(true);
      await requestJson(`/v1/admin/student-reports/${selected.id}/share/revoke`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({}),
      });
      setPublicUrl(undefined);
      setNotice('Karne bağlantısı kapatıldı.');
      await loadDetail(selected.id);
      await loadReports();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Bağlantı kapatılamadı.');
    } finally {
      setBusy(false);
    }
  }

  function updateContent<Key extends keyof StudentReport['content']>(
    key: Key,
    value: StudentReport['content'][Key],
  ) {
    setSelected((current) =>
      current ? { ...current, content: { ...current.content, [key]: value } } : current,
    );
  }

  return (
    <div className="student-tab-content student-report-admin">
      <div className="student-section-heading">
        <FileText aria-hidden="true" />
        <div>
          <span className="eyebrow">ÖĞRENCİ KARNESİ</span>
          <h2>Pratik dönemlerini öğrenciye uygun bir dille özetleyin</h2>
          <p>
            Sayısal veriler sistemden gelir; AI metinleri yalnızca onayınızdan sonra paylaşılır.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" /> Yeni karne
        </Button>
      </div>

      {error ? (
        <Alert tone="danger" title="Karneler yüklenemedi">
          {error}
        </Alert>
      ) : null}
      {loading && !reports ? <Skeleton className="student-detail-skeleton" /> : null}
      {reports && reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Henüz karne yok"
          description="Tamamlanmış bir tarih aralığı seçerek ilk karneyi oluşturun."
        />
      ) : null}

      {reports?.length ? (
        <div className="student-report-layout">
          <aside className="student-report-list" aria-label="Karne geçmişi">
            {reports.map((report) => (
              <button
                key={report.id}
                type="button"
                data-selected={selected?.id === report.id}
                onClick={() => {
                  setPublicUrl(undefined);
                  void loadDetail(report.id);
                }}
              >
                <span>{report.type === 'WEEKLY' ? 'Haftalık karne' : 'Aylık karne'}</span>
                <strong>{formatReportRange(report.periodStart, report.periodEndExclusive)}</strong>
                <small>
                  {report.status === 'DRAFT'
                    ? 'Taslak'
                    : report.status === 'PUBLISHED'
                      ? 'Paylaşıma açık'
                      : 'Onaylandı'}
                  {report.aiStatus === 'PENDING' ? ' · AI hazırlanıyor' : ''}
                </small>
              </button>
            ))}
          </aside>

          {selected ? (
            <section className="student-report-workspace">
              <div className="student-report-toolbar">
                <div>
                  <span className="eyebrow">
                    {formatReportRange(selected.periodStart, selected.periodEndExclusive)}
                  </span>
                  <h3>{studentName} için haftalık karne</h3>
                </div>
                <div className="student-action-row">
                  {selected.status === 'DRAFT' ? (
                    <>
                      <Button
                        variant="secondary"
                        loading={busy || selected.aiStatus === 'PENDING'}
                        onClick={() => void generateAi()}
                      >
                        <Sparkles aria-hidden="true" /> AI taslak
                      </Button>
                      <Button variant="secondary" loading={busy} onClick={() => void saveReport()}>
                        Kaydet
                      </Button>
                      <Button loading={busy} onClick={() => void approveReport()}>
                        <Check aria-hidden="true" /> Onayla
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="secondary" loading={busy} onClick={() => void createShare()}>
                        <Share2 aria-hidden="true" />
                        {selected.share?.status === 'ACTIVE'
                          ? 'Bağlantıyı yenile'
                          : 'Bağlantı oluştur'}
                      </Button>
                      {selected.share?.status === 'ACTIVE' ? (
                        <>
                          <Button loading={busy} onClick={() => void sendShare()}>
                            <Send aria-hidden="true" /> Öğrenci ile paylaş
                          </Button>
                          <Button variant="ghost" loading={busy} onClick={() => void revokeShare()}>
                            Bağlantıyı kapat
                          </Button>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </div>

              {selected.aiStatus === 'FAILED' ? (
                <Alert tone="warning" title="AI taslağı oluşturulamadı">
                  Manuel metinlerle devam edebilir veya LLM ayarlarını kontrol edip yeniden
                  deneyebilirsiniz.
                </Alert>
              ) : null}
              {selected.content.internal.safetyConcern ? (
                <Alert tone="warning" title="Admin incelemesi gerekli">
                  Refleksiyonlarda güvenlik açısından gözden geçirilmesi gereken açık bir ifade
                  işaretlendi.
                </Alert>
              ) : null}
              {publicUrl ? (
                <div className="student-report-share-result">
                  <div>
                    <span>Özel öğrenci bağlantısı</span>
                    <strong>{publicUrl}</strong>
                    {selected.share?.lastSentAt ? (
                      <small>
                        Son gönderim {dateTimeFormatter.format(new Date(selected.share.lastSentAt))}
                        {' · '}
                        {selected.share.sendCount} gönderim
                      </small>
                    ) : null}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void navigator.clipboard.writeText(publicUrl)}
                  >
                    <Copy aria-hidden="true" /> Kopyala
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <Eye aria-hidden="true" /> Aç
                  </Button>
                </div>
              ) : null}

              {selected.status === 'DRAFT' ? (
                <div className="student-report-editor">
                  <label>
                    <span>Karne alt başlığı</span>
                    <input
                      value={selected.content.subtitle}
                      maxLength={180}
                      onChange={(event) => updateContent('subtitle', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Öne çıkan refleksiyon</span>
                    <select
                      value={selected.content.featuredReflectionId ?? ''}
                      onChange={(event) => {
                        const reflection = selected.reflectionCandidates?.find(
                          (item) => item.id === event.target.value,
                        );
                        updateContent('featuredReflectionId', reflection?.id ?? null);
                        setSelected((current) =>
                          current
                            ? {
                                ...current,
                                content: {
                                  ...current.content,
                                  featuredReflectionId: reflection?.id ?? null,
                                  featuredReflectionQuote: reflection?.text,
                                },
                              }
                            : current,
                        );
                      }}
                    >
                      <option value="">Refleksiyon gösterme</option>
                      {selected.reflectionCandidates?.map((reflection) => (
                        <option key={reflection.id} value={reflection.id}>
                          {formatDate(reflection.date)} ·{' '}
                          {reflection.slot === 'MORNING'
                            ? 'Sabah'
                            : reflection.slot === 'EVENING'
                              ? 'Akşam'
                              : 'Özel'}{' '}
                          · {reflection.text.slice(0, 72)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Nazik gözlem</span>
                    <textarea
                      rows={4}
                      value={selected.content.gentleObservation.text}
                      onChange={(event) =>
                        updateContent('gentleObservation', {
                          ...selected.content.gentleObservation,
                          text: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Destek noktası</span>
                    <textarea
                      rows={4}
                      value={selected.content.supportPoint.text}
                      onChange={(event) =>
                        updateContent('supportPoint', {
                          ...selected.content.supportPoint,
                          text: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="student-report-editor__wide">
                    <span>Dönem değerlendirmesi</span>
                    <textarea
                      rows={6}
                      value={selected.content.weeklyEvaluation.text}
                      onChange={(event) =>
                        updateContent('weeklyEvaluation', {
                          ...selected.content.weeklyEvaluation,
                          text: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}

              <ReportPreview report={selected} studentName={studentName} />
            </section>
          ) : null}
        </div>
      ) : null}

      {createOpen ? (
        <Modal
          title="Yeni haftalık karne"
          description="Tamamlanmış günlerden oluşan bir tarih aralığı seçin."
          onClose={() => setCreateOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Vazgeç
              </Button>
              <Button form="student-report-create-form" type="submit" loading={busy}>
                Taslak oluştur
              </Button>
            </>
          }
        >
          <form
            id="student-report-create-form"
            className="student-modal-form"
            onSubmit={createReport}
          >
            <label>
              <span>Başlangıç günü</span>
              <input
                type="date"
                required
                value={period.start}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, start: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Bitiş günü</span>
              <input
                type="date"
                required
                value={period.endExclusive}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, endExclusive: event.target.value }))
                }
              />
              <small>Bu tarih aralığa dahil değildir.</small>
            </label>
          </form>
        </Modal>
      ) : null}

      {notice ? (
        <Toast tone="info" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Toast>
      ) : null}
    </div>
  );
}

function ReportPreview({ report, studentName }: { report: StudentReport; studentName: string }) {
  const facts = report.snapshot.practice.current;
  const firstName = studentName.trim().split(/\s+/u)[0] || 'Öğrenci';
  return (
    <article className="student-report-preview">
      <header>
        <span>Sakin Zihin · Haftalık karne</span>
        <h3>{firstName}&apos;nin pratik karnesi</h3>
        <p>
          {formatReportRange(report.periodStart, report.periodEndExclusive)} ·{' '}
          {report.content.subtitle}
        </p>
        <div>
          {report.snapshot.subscription?.packageWeek ? (
            <small>Aylık program · {report.snapshot.subscription.packageWeek}. hafta</small>
          ) : null}
          <small>{report.snapshot.practice.maxCompletedDayStreak} günlük devam serisi</small>
        </div>
      </header>
      <section className="student-report-score">
        <div
          className="student-report-ring"
          style={{ '--report-progress': `${facts.completionRate * 3.6}deg` } as CSSProperties}
        >
          <strong>%{facts.completionRate}</strong>
          <span>tamamlama</span>
        </div>
        <div>
          <h4>
            Planlanan {facts.planned} pratikten {facts.completed} tanesi tamamlandı.
          </h4>
          <div className="student-report-stats">
            <span>
              <b>{facts.planned}</b>Planlanan
            </span>
            <span>
              <b>{facts.completed}</b>Tamamlanan
            </span>
            <span>
              <b>{facts.skipped}</b>Yapılamadı
            </span>
            <span>
              <b>{facts.missed}</b>Geri dönüş yok
            </span>
          </div>
        </div>
      </section>
      <section>
        <div className="student-report-days">
          {report.snapshot.practice.days.map((day) => (
            <div key={day.date} data-day-status={reportDayStatus(day.sessions)}>
              <strong>{new Date(`${day.date}T00:00:00`).getDate()}</strong>
              <span>
                {new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(
                  new Date(`${day.date}T00:00:00`),
                )}
              </span>
              <div>
                {day.sessions.length ? (
                  day.sessions.map((session) => (
                    <i
                      key={session.id}
                      data-status={session.status}
                      title={`${session.slot} · ${label(session.status)}`}
                    >
                      {session.status === 'COMPLETED' ? (
                        <Check aria-hidden="true" />
                      ) : session.status === 'MISSED' || session.status === 'SKIPPED' ? (
                        <X aria-hidden="true" />
                      ) : (
                        <Clock3 aria-hidden="true" />
                      )}
                    </i>
                  ))
                ) : (
                  <i data-status="EMPTY" aria-label="Bu gün için pratik yok">
                    <span aria-hidden="true">–</span>
                  </i>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      {report.content.featuredReflectionQuote ? (
        <blockquote>
          <span>Bu hafta öne çıkan deneyim</span>“{report.content.featuredReflectionQuote}”
        </blockquote>
      ) : null}
      <section className="student-report-observations">
        <div>
          <span>Nazik gözlem</span>
          <p>{report.content.gentleObservation.text}</p>
        </div>
        <div>
          <span>Destek noktası</span>
          <p>{report.content.supportPoint.text}</p>
        </div>
      </section>
      <section className="student-report-evaluation">
        <span>Hafta değerlendirmesi</span>
        <p>{report.content.weeklyEvaluation.text}</p>
      </section>
    </article>
  );
}

function reportDayStatus(sessions: Array<{ status: string }>) {
  if (!sessions.length) return 'EMPTY';
  if (sessions.some((session) => session.status === 'MISSED')) return 'MISSED';
  if (sessions.some((session) => session.status === 'SKIPPED')) return 'SKIPPED';
  if (sessions.every((session) => session.status === 'COMPLETED')) return 'COMPLETED';
  return 'PENDING';
}

function defaultReportPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start: localDateInput(start), endExclusive: localDateInput(end) };
}

function localDateInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatReportRange(start: string, endExclusive: string) {
  const end = new Date(`${endExclusive}T00:00:00`);
  end.setDate(end.getDate() - 1);
  return `${formatDate(start)} – ${dateFormatter.format(end)}`;
}

function Overview({
  data,
  onOpenHandoffs,
  onEditSubscription,
  onCreateSubscription,
}: {
  data: Detail;
  onOpenHandoffs: () => void;
  onEditSubscription: () => void;
  onCreateSubscription: () => void;
}) {
  const latestSubscription = preferredSubscription(data.subscriptions);
  const scheduledSubscription = data.subscriptions
    .filter((subscription) => subscription.status === 'SCHEDULED')
    .sort(
      (left, right) => new Date(left.startDate).getTime() - new Date(right.startDate).getTime(),
    )[0];
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
        <button className="student-metric-button" type="button" onClick={onOpenHandoffs}>
          <Metric
            label="Aktif handover"
            value={data.openHandoffCount}
            detail={data.openHandoffCount ? 'Yanıt bekleyen kayıt' : 'Bekleyen kayıt yok'}
            icon={LifeBuoy}
          />
        </button>
      </div>
      <div className="student-overview-grid">
        <section className="student-panel">
          <div className="student-panel__heading">
            <div>
              <span className="eyebrow">ÜYELİK</span>
              <h2>Aktif paket</h2>
            </div>
            <div className="student-action-row">
              {latestSubscription ? (
                <>
                  <Badge tone={statusTone[latestSubscription.status] ?? 'neutral'}>
                    {label(latestSubscription.status)}
                  </Badge>
                  {['ACTIVE', 'SCHEDULED'].includes(latestSubscription.status) ? (
                    <Button variant="ghost" size="sm" onClick={onEditSubscription}>
                      <Pencil aria-hidden="true" /> Bitiş tarihini değiştir
                    </Button>
                  ) : null}
                </>
              ) : null}
              <Button variant="secondary" size="sm" onClick={onCreateSubscription}>
                <Plus aria-hidden="true" /> Yeni paket oluştur
              </Button>
            </div>
          </div>
          {latestSubscription ? (
            <dl className="student-info-list">
              <div>
                <dt>Dönem</dt>
                <dd>
                  {formatDate(latestSubscription.startDate)} –{' '}
                  {formatInclusiveEndDate(latestSubscription.endExclusive)}
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
              {scheduledSubscription && scheduledSubscription.id !== latestSubscription.id ? (
                <div>
                  <dt>Planlanan paket</dt>
                  <dd>
                    {formatDate(scheduledSubscription.startDate)} –{' '}
                    {formatInclusiveEndDate(scheduledSubscription.endExclusive)} · 4 görüşme
                  </dd>
                </div>
              ) : null}
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
  meditationOptions,
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
  onEditOutcome,
}: {
  data: Detail;
  planEditing: boolean;
  planForm: PracticePlanForm;
  meditationOptions: MeditationOption[];
  setPlanEditing: (value: boolean) => void;
  setPlanForm: (value: PracticePlanForm) => void;
  savePlan: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  busy: boolean;
  setPracticeAction: (value: 'pause' | 'restore') => void;
  practiceTab: 'history' | 'planned' | 'cancelled';
  setPracticeTab: (value: 'history' | 'planned' | 'cancelled') => void;
  onReschedule: (session: PracticeSession) => void;
  onCancel: (session: PracticeSession) => void;
  onRestore: (session: PracticeSession) => void;
  onEditOutcome: (session: PracticeSession) => void;
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
          <p>Sabah ve akşam saatlerini, sürelerini ve planın durumunu buradan güncelleyin.</p>
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
            <input
              aria-label="Sabah süresi"
              type="number"
              min="1"
              max="180"
              required={planForm.morningActive}
              disabled={!planForm.morningActive}
              value={planForm.morningDuration}
              onChange={(event) =>
                setPlanForm({ ...planForm, morningDuration: event.target.value })
              }
            />
            <select
              aria-label="Sabah meditasyonu"
              disabled={!planForm.morningActive}
              value={planForm.morningMeditationTypeId}
              onChange={(event) =>
                setPlanForm({ ...planForm, morningMeditationTypeId: event.target.value })
              }
            >
              <option value="">Yönlendirmesiz</option>
              {meditationOptions.map((meditation) => (
                <option key={meditation.id} value={meditation.id}>
                  {meditation.title}
                </option>
              ))}
            </select>
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
            <input
              aria-label="Akşam süresi"
              type="number"
              min="1"
              max="180"
              required={planForm.eveningActive}
              disabled={!planForm.eveningActive}
              value={planForm.eveningDuration}
              onChange={(event) =>
                setPlanForm({ ...planForm, eveningDuration: event.target.value })
              }
            />
            <select
              aria-label="Akşam meditasyonu"
              disabled={!planForm.eveningActive}
              value={planForm.eveningMeditationTypeId}
              onChange={(event) =>
                setPlanForm({ ...planForm, eveningMeditationTypeId: event.target.value })
              }
            >
              <option value="">Yönlendirmesiz</option>
              {meditationOptions.map((meditation) => (
                <option key={meditation.id} value={meditation.id}>
                  {meditation.title}
                </option>
              ))}
            </select>
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
          <PracticeWeekdaySelector
            value={planForm.activeWeekdays}
            onChange={(activeWeekdays) => setPlanForm({ ...planForm, activeWeekdays })}
          />
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
              <small>
                {slot.durationMinutes} dakika · {slot.meditationType?.title ?? 'Yönlendirmesiz'}
              </small>
            </div>
          ))}
          <div>
            <span>Aktif günler</span>
            <strong>{formatPracticeWeekdays(plan.activeWeekdays)}</strong>
            <small>{plan.activeWeekdays.length} gün</small>
          </div>
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
                onEditOutcome={practiceTab === 'history' ? onEditOutcome : undefined}
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
  onEditOutcome,
  busy = false,
}: {
  session: PracticeSession;
  compact?: boolean;
  onReschedule?: (session: PracticeSession) => void;
  onCancel?: (session: PracticeSession) => void;
  onRestore?: (session: PracticeSession) => void;
  onEditOutcome?: (session: PracticeSession) => void;
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
        <small>
          {session.durationMinutes} dk
          {session.meditationType ? ` · ${session.meditationType.title}` : ''}
        </small>
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
          {session.reflection?.voiceMedia ? (
            <VoiceAudioPlayer media={session.reflection.voiceMedia} />
          ) : null}
          {session.reflection?.tags.length ? (
            <small>{session.reflection.tags.map((tag) => tag.tag).join(' · ')}</small>
          ) : null}
        </div>
      ) : null}
      {!compact && (onReschedule || onCancel || onRestore || onEditOutcome) ? (
        <div className="student-row-actions student-session-actions">
          {onEditOutcome ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onEditOutcome(session)}
            >
              <Pencil aria-hidden="true" />
              Durumu düzenle
            </Button>
          ) : null}
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
  const usedSubscriptionIds = new Set(data.meetings.map((meeting) => meeting.subscriptionId));
  const eligibleSubscriptions = data.subscriptions.filter(
    (item) =>
      (item.status === 'ACTIVE' || item.status === 'SCHEDULED') &&
      !usedSubscriptionIds.has(item.id),
  );
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
        {eligibleSubscriptions.length ? (
          <Button onClick={openCreate}>
            <CalendarClock aria-hidden="true" />
            {data.meetings.length ? 'Yeni dönem serisi' : 'Seri oluştur'}
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
  busy,
}: {
  data: Detail;
  conversation?: Conversation;
  loading: boolean;
  error?: string;
  onReload: () => Promise<void>;
  onReply: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  busy: boolean;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [conversation?.items.length]);
  const groupedIntents = new Map<
    string,
    { category: string; status: string; reason?: string; count: number }
  >();
  for (const intent of conversation?.intents ?? []) {
    const key = `${intent.category}:${intent.status}:${intent.suppressionReason ?? ''}`;
    const current = groupedIntents.get(key);
    if (current) current.count += 1;
    else
      groupedIntents.set(key, {
        category: intent.category,
        status: intent.status,
        reason: intent.suppressionReason,
        count: 1,
      });
  }

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
        <div className="student-conversation-layout">
          <div className="student-message-timeline" ref={timelineRef}>
            {conversation.items.length ? (
              conversation.items.map((item) => (
                <MessageBubble
                  key={item.id}
                  direction={item.direction === 'OUTBOUND' ? 'outbound' : 'inbound'}
                  channel={item.status}
                  time={formatDateTime(item.occurredAt)}
                >
                  <div>
                    {item.content ? <p className="message-content">{item.content}</p> : null}
                    {item.voiceMedia ? <VoiceAudioPlayer media={item.voiceMedia} /> : null}
                    {!item.content && !item.voiceMedia ? 'İçerik çözülemedi' : null}
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
            {groupedIntents.size ? (
              <details className="student-intent-list">
                <summary>Teknik gönderim kayıtları ({conversation.intents.length})</summary>
                <small className="muted">Benzer kayıtlar birlikte gösterilir</small>
                {[...groupedIntents.entries()].slice(0, 5).map(([key, intent]) => (
                  <div key={key}>
                    <span>
                      {intentLabels[intent.category] ?? label(intent.category)}
                      {intent.count > 1 ? ` · ${intent.count} kez` : ''}
                    </span>
                    <Badge tone={statusTone[intent.status] ?? 'neutral'}>
                      {label(intent.status)}
                    </Badge>
                    {intent.reason ? (
                      <small className="student-intent-reason">
                        {suppressionLabels[intent.reason] ?? intent.reason}
                      </small>
                    ) : null}
                  </div>
                ))}
              </details>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function HandoffsTab({
  conversation,
  loading,
  error,
  onReload,
  onResolveHandoff,
  busy,
}: {
  conversation?: Conversation;
  loading: boolean;
  error?: string;
  onReload: () => Promise<void>;
  onResolveHandoff: (handoffId: string, content?: string) => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="student-tab-content">
      <div className="student-section-heading">
        <div>
          <span className="eyebrow">ADMİN AKSİYONU</span>
          <h2>Handover kayıtları</h2>
          <p>Yanıt bekleyen yönlendirmeleri inceleyin, yanıtlayın ve kapatın.</p>
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
        <HandoffQueue
          handoffs={conversation.handoffs}
          messages={conversation.items}
          busy={busy}
          onResolve={onResolveHandoff}
        />
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

function NotesTab({
  notes,
  loading,
  error,
  onReload,
  onCreate,
  onEdit,
  onDelete,
}: {
  notes?: StudentNote[];
  loading: boolean;
  error?: string;
  onReload: () => Promise<void>;
  onCreate: () => void;
  onEdit: (note: StudentNote) => void;
  onDelete: (note: StudentNote) => void;
}) {
  return (
    <div className="student-tab-content">
      <div className="student-section-heading">
        <div>
          <span className="eyebrow">ÖZEL TAKİP</span>
          <h2>Öğrenci notları</h2>
          <p>Durum, ihtiyaç ve takip edilmesi gereken konuları tarihçe halinde kaydedin.</p>
        </div>
        <div className="student-row-actions">
          <Button
            variant="ghost"
            size="icon"
            title="Notları yenile"
            aria-label="Notları yenile"
            onClick={() => void onReload()}
            loading={loading}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
          <Button onClick={onCreate}>
            <Plus aria-hidden="true" />
            Yeni not
          </Button>
        </div>
      </div>
      {error ? (
        <Alert tone="danger" title="Notlar yüklenemedi">
          {error}
        </Alert>
      ) : loading && !notes ? (
        <div className="student-private-note-list">
          <Skeleton className="student-private-note-skeleton" />
          <Skeleton className="student-private-note-skeleton" />
        </div>
      ) : notes?.length ? (
        <div className="student-private-note-list">
          {notes.map((note) => {
            const edited = note.updatedAt !== note.createdAt;
            return (
              <article className="student-private-note" key={note.id}>
                <div className="student-private-note__meta">
                  <div>
                    <NotebookPen aria-hidden="true" />
                    <strong>{formatDateTime(note.createdAt)}</strong>
                  </div>
                  <div className="student-row-actions">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Notu düzenle"
                      aria-label="Notu düzenle"
                      onClick={() => onEdit(note)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Notu sil"
                      aria-label="Notu sil"
                      onClick={() => onDelete(note)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <p>{note.content}</p>
                <small>
                  {note.createdBy}
                  {edited
                    ? ` · ${formatDateTime(note.updatedAt)} tarihinde ${note.updatedBy} tarafından düzenlendi`
                    : ''}
                </small>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Henüz öğrenci notu yok"
          description="İlk takip notunu ekleyerek öğrencinin güncel durumunu kaydedin."
          icon={NotebookPen}
          action={
            <Button onClick={onCreate}>
              <Plus aria-hidden="true" />
              İlk notu ekle
            </Button>
          }
        />
      )}
    </div>
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

function ProfileTab({ data, onChangeWhatsApp }: { data: Detail; onChangeWhatsApp: () => void }) {
  const changeableWhatsAppId = data.channels.find(
    (channel) => channel.type === 'WHATSAPP' && channel.status === 'ACTIVE',
  )?.id;

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
                  <div className="student-channel-row-actions">
                    <Badge tone={channel.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {label(channel.status)}
                    </Badge>
                    {channel.id === changeableWhatsAppId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="WhatsApp numarasını değiştir"
                        title="WhatsApp numarasını değiştir"
                        onClick={onChangeWhatsApp}
                      >
                        <Smartphone aria-hidden="true" /> Değiştir
                      </Button>
                    ) : null}
                  </div>
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

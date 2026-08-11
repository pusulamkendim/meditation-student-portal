'use client';

import { Alert, Badge, EmptyState, PageHeader, Skeleton } from '@meditation/ui';
import { ArrowRight, MessageCircle, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type Student = {
  id: string;
  fullName?: string;
  status: string;
  registrationStep: string;
  timezone: string;
  createdAt: string;
  journey: { key: string; label: string; completedMeetingCount: number; source: string };
  channel?: {
    type: string;
    displayName: string;
    identifier?: string;
    status: string;
  };
  subscription?: {
    status: string;
    startDate: string;
    endExclusive: string;
    priceMinor: string;
    currency: string;
    credits: number;
  };
  practice: {
    completed: number;
    missed: number;
    skipped: number;
    pending: number;
    complianceRate: number;
    nextStartAt?: string;
  };
  nextMeetingAt?: string;
};

const statusLabels: Record<string, string> = {
  ACTIVE: 'Aktif',
  PAYMENT_PENDING: 'Ödeme bekliyor',
  PAUSED: 'Duraklatıldı',
  INACTIVE: 'Pasif',
  LEAD: 'Aday',
  DELETION_PENDING: 'Silme bekliyor',
  DELETED: 'Silindi',
};

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(value?: string) {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

function formatChannel(channel?: Student['channel']) {
  if (!channel) return 'Kanal bağlanmadı';
  return `${channel.type === 'WHATSAPP' ? 'WhatsApp' : 'Telegram'}${channel.identifier ? ` · ${channel.identifier}` : ''}`;
}

function initials(fullName?: string) {
  if (!fullName?.trim()) return '?';
  const parts = fullName.trim().split(/\s+/u);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''}`.toLocaleUpperCase(
    'tr-TR',
  );
}

export default function StudentsPage() {
  const [items, setItems] = useState<Student[]>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [journeyFilter, setJourneyFilter] = useState('ALL');

  useEffect(() => {
    void fetch(`${api}/v1/admin/students`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ items: Student[] }>;
      })
      .then((value) => setItems(value.items))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Bağlantı hatası'),
      );
  }, []);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');
    return (items ?? []).filter((student) => {
      const matchesQuery =
        !normalizedQuery ||
        [student.fullName, student.id, student.channel?.identifier]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase('tr-TR').includes(normalizedQuery));
      const matchesStatus = statusFilter === 'ALL' || student.status === statusFilter;
      const matchesChannel = channelFilter === 'ALL' || student.channel?.type === channelFilter;
      const matchesJourney = journeyFilter === 'ALL' || student.journey.key === journeyFilter;
      return matchesQuery && matchesStatus && matchesChannel && matchesJourney;
    });
  }, [items, query, statusFilter, channelFilter, journeyFilter]);

  const counts = useMemo(
    () => ({
      total: items?.length ?? 0,
      active: items?.filter((student) => student.status === 'ACTIVE').length ?? 0,
      attention:
        items?.filter(
          (student) =>
            student.status === 'PAYMENT_PENDING' ||
            student.practice.missed > student.practice.completed,
        ).length ?? 0,
    }),
    [items],
  );

  return (
    <main className="content">
      <PageHeader
        title="Öğrenciler"
        description="Üyelik, pratik devamlılığı ve birebir görüşme akışını tek görünümden yönetin"
        actions={<Badge tone="info">{counts.total} kayıt</Badge>}
      />

      <div className="student-summary-strip" aria-label="Öğrenci özeti">
        <div>
          <strong>{counts.active}</strong>
          <span>Aktif öğrenci</span>
        </div>
        <div>
          <strong>{counts.attention}</strong>
          <span>İlgi bekleyen</span>
        </div>
        <div>
          <strong>
            {items?.filter((student) => student.channel?.type === 'WHATSAPP').length ?? 0}
          </strong>
          <span>WhatsApp</span>
        </div>
        <div>
          <strong>
            {items?.filter((student) => student.channel?.type === 'TELEGRAM').length ?? 0}
          </strong>
          <span>Telegram</span>
        </div>
      </div>

      <div className="student-toolbar">
        <label className="student-search">
          <Search aria-hidden="true" />
          <input
            aria-label="Öğrenci ara"
            placeholder="İsim, telefon veya öğrenci kodu"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="student-filters">
          <label>
            <span>Durum</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">Tüm durumlar</option>
              <option value="ACTIVE">Aktif</option>
              <option value="PAYMENT_PENDING">Ödeme bekliyor</option>
              <option value="PAUSED">Duraklatıldı</option>
              <option value="INACTIVE">Pasif</option>
            </select>
          </label>
          <label>
            <span>Kanal</span>
            <select
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value)}
            >
              <option value="ALL">Tüm kanallar</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="TELEGRAM">Telegram</option>
            </select>
          </label>
          <label>
            <span>İlerleme</span>
            <select
              value={journeyFilter}
              onChange={(event) => setJourneyFilter(event.target.value)}
            >
              <option value="ALL">Tüm haftalar</option>
              <option value="WEEK_0">0. Hafta</option>
              <option value="WEEK_1">1. Hafta</option>
              <option value="WEEK_2">2. Hafta</option>
              <option value="WEEK_3">3. Hafta</option>
              <option value="WEEK_4">4. Hafta</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" title="Öğrenciler yüklenemedi">
          {error}
        </Alert>
      ) : !items ? (
        <div className="preview-stack" aria-label="Öğrenciler yükleniyor">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Eşleşen öğrenci yok"
          description="Arama veya filtreleri değiştirerek tekrar deneyin."
        />
      ) : (
        <div className="student-directory-list">
          {visible.map((student, index) => (
            <a className="student-directory-row" href={`/students/${student.id}`} key={student.id}>
              <span className="student-directory-identity">
                <span className={`student-list-avatar is-${index % 2 === 0 ? 'gold' : 'sage'}`}>
                  {initials(student.fullName)}
                </span>
                <span className="student-identity-copy">
                  <strong>{student.fullName ?? 'İsim belirtilmedi'}</strong>
                  <small>
                    <MessageCircle aria-hidden="true" /> {formatChannel(student.channel)}
                  </small>
                </span>
              </span>
              <span className="student-directory-stat">
                <small>İlerleme</small>
                <strong>{student.journey.label}</strong>
                <em>{student.journey.completedMeetingCount} tamamlanan görüşme</em>
              </span>
              <span className="student-directory-stat is-practice">
                <small>Pratik uyumu</small>
                <strong>%{student.practice.complianceRate}</strong>
                <em>
                  {student.practice.completed} tamamlandı · {student.practice.missed} kaçırıldı
                </em>
              </span>
              <span className="student-directory-stat is-meeting">
                <small>Sonraki görüşme</small>
                <strong>{formatDate(student.nextMeetingAt)}</strong>
                <em>{student.nextMeetingAt ? 'Planlandı' : 'Görüşme yok'}</em>
              </span>
              <span className="student-directory-stat is-membership">
                <small>Üyelik</small>
                <strong>
                  {student.subscription ? formatDate(student.subscription.endExclusive) : '—'}
                </strong>
                <em>
                  {student.subscription
                    ? `${student.subscription.credits} görüşme kredisi`
                    : 'Paket yok'}
                </em>
              </span>
              <span
                className={`student-directory-status is-${student.status.toLocaleLowerCase('en-US')}`}
              >
                <i aria-hidden="true" />
                {statusLabels[student.status] ?? student.status}
              </span>
              <ArrowRight className="student-directory-arrow" aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </main>
  );
}

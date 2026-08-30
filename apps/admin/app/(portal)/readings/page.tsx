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
  Archive,
  BarChart3,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Globe2,
  Link2,
  PauseCircle,
  Pencil,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type ReadingSummary = {
  id: string;
  title: string;
  description?: string | null;
  author?: string | null;
  estimatedMinutes: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  allowAgent: boolean;
  version: number;
  updatedAt: string;
  pdfByteSize?: number | null;
  coverImageMimeType?: string | null;
  coverImageAlt?: string | null;
  coverImageByteSize?: number | null;
  _count: { sections: number; assignments: number };
  assignmentCounts: { ASSIGNED: number; OPENED: number; COMPLETED: number };
  publicShare?: {
    id: string;
    slug: string;
    status: 'ACTIVE' | 'PAUSED';
    expiresAt?: string | null;
  } | null;
};
type Assignment = {
  id: string;
  status: 'ASSIGNED' | 'OPENED' | 'COMPLETED';
  progressPercent: number;
  assignedAt: string;
  openedAt?: string | null;
  completedAt?: string | null;
  response?: string;
  student: { id: string; fullName?: string; status: string };
  messageIntent?: { status: string; suppressionReason?: string | null } | null;
};
type ReadingDetail = Omit<ReadingSummary, '_count' | 'assignmentCounts'> & {
  sourceFilename: string;
  sourceByteSize: number;
  pdfFilename?: string | null;
  sections: Array<{
    id: string;
    position: number;
    title: string;
    contentMarkdown: string;
    wordCount: number;
  }>;
  assignments: Assignment[];
};
type PublicShare = {
  id: string;
  readingId: string;
  slug: string;
  status: 'ACTIVE' | 'PAUSED';
  effectiveStatus: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'READING_UNAVAILABLE';
  allowPdf: boolean;
  allowIndexing: boolean;
  expiresAt?: string | null;
  version: number;
  publicUrl: string;
  readingTitle: string;
  hasPdf: boolean;
  metrics: {
    totalViews: number;
    totalPdfDownloads: number;
    whatsappClicks: number;
    uniqueReaders: number;
    activeReaders: number;
    completedReaders: number;
    completionRate: number;
    averageProgress: number;
    sources: Array<{
      source: string;
      medium?: string | null;
      campaign?: string | null;
      uniqueReaders: number;
      totalViews: number;
    }>;
  };
};
type Student = {
  id: string;
  fullName?: string;
  status: string;
  channel?: { type: string; identifier?: string };
};
type AssignmentResult = {
  studentId: string;
  assignmentId?: string;
  readingUrl?: string;
  sent: boolean;
  completed?: boolean;
  error?: string;
};
type Notice = { tone: 'success' | 'danger' | 'info'; text: string };

function csrfHeaders(json = false): HeadersInit {
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, { credentials: 'include', ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error((payload as { message?: string }).message ?? `HTTP ${response.status}`);
  return payload as T;
}

function formatDate(value?: string | null) {
  if (!value) return 'Henüz yok';
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(value?: number | null) {
  if (!value) return 'Yok';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: ReadingSummary['status']) {
  return { DRAFT: 'Taslak', PUBLISHED: 'Yayında', ARCHIVED: 'Arşivde' }[status];
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/ı/gu, 'i')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 100);
}

function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function countWords(value: string) {
  return value.match(/[\p{Letter}\p{Number}]+(?:['’][\p{Letter}\p{Number}]+)*/gu)?.length ?? 0;
}

export default function ReadingsPage() {
  const [readings, setReadings] = useState<ReadingSummary[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<ReadingDetail>();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [assignmentResults, setAssignmentResults] = useState<AssignmentResult[]>([]);
  const [query, setQuery] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('20');
  const [coverImageAlt, setCoverImageAlt] = useState('');
  const [activeSection, setActiveSection] = useState(0);
  const [editingContent, setEditingContent] = useState(false);
  const [contentPreview, setContentPreview] = useState(false);
  const [contentDraft, setContentDraft] = useState<ReadingDetail['sections']>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [publicShareOpen, setPublicShareOpen] = useState(false);
  const [publicShare, setPublicShare] = useState<PublicShare>();
  const [publicSlug, setPublicSlug] = useState('');
  const [publicAllowPdf, setPublicAllowPdf] = useState(false);
  const [publicAllowIndexing, setPublicAllowIndexing] = useState(false);
  const [publicExpiresAt, setPublicExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const uploadForm = useRef<HTMLFormElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const loadReadings = useCallback(async (preferredId?: string) => {
    setError(undefined);
    try {
      const result = await request<ReadingSummary[]>('/v1/admin/readings');
      setReadings(result);
      setSelectedId((current) => {
        const candidate = preferredId ?? current;
        if (candidate && result.some((reading) => reading.id === candidate)) return candidate;
        return result[0]?.id;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Okumalar yüklenemedi.');
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const result = await request<ReadingDetail>(`/v1/admin/readings/${id}`);
      setDetail(result);
      setTitle(result.title);
      setDescription(result.description ?? '');
      setAuthor(result.author ?? '');
      setEstimatedMinutes(String(result.estimatedMinutes));
      setCoverImageAlt(result.coverImageAlt ?? '');
      setActiveSection((current) => Math.min(current, Math.max(0, result.sections.length - 1)));
      setEditingContent(false);
      setContentPreview(false);
      setContentDraft(result.sections.map((section) => ({ ...section })));
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Okuma açılamadı.',
      });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadReadings();
  }, [loadReadings]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(undefined);
  }, [loadDetail, selectedId]);

  const filteredReadings = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('tr-TR');
    if (!term) return readings ?? [];
    return (readings ?? []).filter(
      (reading) =>
        reading.title.toLocaleLowerCase('tr-TR').includes(term) ||
        reading.author?.toLocaleLowerCase('tr-TR').includes(term),
    );
  }, [query, readings]);

  const filteredStudents = useMemo(() => {
    const term = studentQuery.trim().toLocaleLowerCase('tr-TR');
    return students.filter(
      (student) =>
        student.status === 'ACTIVE' &&
        (!term ||
          student.fullName?.toLocaleLowerCase('tr-TR').includes(term) ||
          student.id.startsWith(term)),
    );
  }, [studentQuery, students]);

  const contentChanged = useMemo(() => {
    if (!detail || contentDraft.length !== detail.sections.length) return false;
    return contentDraft.some((section, index) => {
      const current = detail.sections[index];
      return (
        !current ||
        section.id !== current.id ||
        section.title !== current.title ||
        section.contentMarkdown !== current.contentMarkdown
      );
    });
  }, [contentDraft, detail]);

  useEffect(() => {
    if (!editingContent || !contentChanged) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [contentChanged, editingContent]);

  function discardContentChanges() {
    if (contentChanged && !window.confirm('Kaydedilmemiş metin değişiklikleri silinsin mi?'))
      return false;
    setEditingContent(false);
    setContentPreview(false);
    setContentDraft(detail?.sections.map((section) => ({ ...section })) ?? []);
    return true;
  }

  function beginContentEdit() {
    if (!detail) return;
    setContentDraft(detail.sections.map((section) => ({ ...section })));
    setContentPreview(false);
    setEditingContent(true);
  }

  function updateDraftSection(
    sectionId: string,
    field: 'title' | 'contentMarkdown',
    value: string,
  ) {
    setContentDraft((sections) =>
      sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              [field]: value,
              ...(field === 'contentMarkdown' ? { wordCount: countWords(value) } : {}),
            }
          : section,
      ),
    );
  }

  async function saveContent() {
    if (!detail || !contentChanged) return;
    if (contentDraft.some((section) => !section.title.trim() || !section.contentMarkdown.trim())) {
      setNotice({ tone: 'danger', text: 'Bölüm başlığı ve içeriği boş bırakılamaz.' });
      return;
    }
    setBusy(true);
    try {
      const result = await request<ReadingDetail>(`/v1/admin/readings/${detail.id}/content`, {
        method: 'PATCH',
        headers: csrfHeaders(true),
        body: JSON.stringify({
          expectedVersion: detail.version,
          sections: contentDraft.map(({ id, title: sectionTitle, contentMarkdown }) => ({
            id,
            title: sectionTitle,
            contentMarkdown,
          })),
        }),
      });
      setDetail(result);
      setContentDraft(result.sections.map((section) => ({ ...section })));
      setEditingContent(false);
      setContentPreview(false);
      setNotice({ tone: 'success', text: 'Okuma metni güncellendi.' });
      await loadReadings(result.id);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Okuma metni kaydedilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function uploadReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const markdown = form.get('markdown');
    const pdf = form.get('pdf');
    if (
      (!(markdown instanceof File) || markdown.size === 0) &&
      (!(pdf instanceof File) || pdf.size === 0)
    ) {
      setNotice({ tone: 'danger', text: 'Markdown veya PDF dosyalarından birini seçin.' });
      return;
    }
    setBusy(true);
    try {
      const created = await request<ReadingDetail>('/v1/admin/readings/upload', {
        method: 'POST',
        headers: csrfHeaders(),
        body: form,
      });
      setUploadOpen(false);
      uploadForm.current?.reset();
      setNotice({
        tone: 'success',
        text: `${created.sections.length} bölümlük okuma taslağı oluşturuldu.`,
      });
      await loadReadings(created.id);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Okuma yüklenemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveMetadata() {
    if (!detail) return;
    setBusy(true);
    try {
      await request(`/v1/admin/readings/${detail.id}`, {
        method: 'PATCH',
        headers: csrfHeaders(true),
        body: JSON.stringify({
          expectedVersion: detail.version,
          title,
          description: description || null,
          author: author || null,
          estimatedMinutes: Number(estimatedMinutes),
          coverImageAlt: coverImageAlt || null,
        }),
      });
      setNotice({ tone: 'success', text: 'Okuma bilgileri kaydedildi.' });
      await loadReadings(detail.id);
      await loadDetail(detail.id);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Değişiklikler kaydedilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function uploadCoverImage(file?: File) {
    if (!detail || !file) return;
    const body = new FormData();
    body.set('coverImage', file);
    body.set('expectedVersion', String(detail.version));
    body.set('coverImageAlt', coverImageAlt);
    setBusy(true);
    try {
      await request(`/v1/admin/readings/${detail.id}/cover-image`, {
        method: 'POST',
        headers: csrfHeaders(),
        body,
      });
      await Promise.all([loadReadings(detail.id), loadDetail(detail.id)]);
      setNotice({ tone: 'success', text: 'Okuma kapak görseli güncellendi.' });
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Kapak görseli yüklenemedi.',
      });
    } finally {
      setBusy(false);
      if (coverInput.current) coverInput.current.value = '';
    }
  }

  async function removeCoverImage() {
    if (!detail) return;
    setBusy(true);
    try {
      await request(`/v1/admin/readings/${detail.id}/cover-image`, {
        method: 'DELETE',
        headers: csrfHeaders(true),
        body: JSON.stringify({ expectedVersion: detail.version }),
      });
      await Promise.all([loadReadings(detail.id), loadDetail(detail.id)]);
      setNotice({ tone: 'success', text: 'Özel kapak kaldırıldı; editorial görsel kullanılacak.' });
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Kapak görseli kaldırılamadı.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: ReadingSummary['status']) {
    if (!detail) return;
    setBusy(true);
    try {
      await request(`/v1/admin/readings/${detail.id}`, {
        method: 'PATCH',
        headers: csrfHeaders(true),
        body: JSON.stringify({ expectedVersion: detail.version, status }),
      });
      setNotice({
        tone: 'success',
        text: status === 'PUBLISHED' ? 'Okuma yayına alındı.' : 'Okuma arşivlendi.',
      });
      await loadReadings(detail.id);
      await loadDetail(detail.id);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Durum değiştirilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteReading() {
    if (!detail || detail.assignments.length > 0 || detail.publicShare) return;
    setBusy(true);
    try {
      await request(`/v1/admin/readings/${detail.id}`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      });
      setDeleteOpen(false);
      setDetail(undefined);
      setNotice({ tone: 'success', text: 'Okuma kalıcı olarak silindi.' });
      await loadReadings();
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Okuma silinemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function openAssignment() {
    setAssignOpen(true);
    setSelectedStudents([]);
    setStudentQuery('');
    if (students.length) return;
    try {
      const result = await request<{ items: Student[] }>('/v1/admin/students');
      setStudents(result.items);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Öğrenciler yüklenemedi.',
      });
    }
  }

  async function assignReading() {
    if (!detail || !selectedStudents.length) return;
    setBusy(true);
    try {
      const result = await request<{ items: AssignmentResult[] }>(
        `/v1/admin/readings/${detail.id}/assignments`,
        {
          method: 'POST',
          headers: csrfHeaders(true),
          body: JSON.stringify({ studentIds: selectedStudents }),
        },
      );
      setAssignmentResults(result.items);
      setAssignOpen(false);
      setResultsOpen(true);
      await loadDetail(detail.id);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Okuma paylaşılamadı.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url?: string) {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setNotice({ tone: 'success', text: 'Öğrenci bağlantısı panoya kopyalandı.' });
  }

  function applyPublicShare(result: PublicShare) {
    setPublicShare(result);
    setPublicSlug(result.slug);
    setPublicAllowPdf(result.allowPdf);
    setPublicAllowIndexing(result.allowIndexing);
    setPublicExpiresAt(localDateTime(result.expiresAt));
  }

  async function openPublicShare() {
    if (!detail) return;
    setPublicShareOpen(true);
    if (!detail.publicShare) {
      setPublicShare(undefined);
      setPublicSlug(slugify(detail.title));
      setPublicAllowPdf(false);
      setPublicAllowIndexing(false);
      setPublicExpiresAt('');
      return;
    }
    setBusy(true);
    try {
      applyPublicShare(await request<PublicShare>(`/v1/admin/readings/${detail.id}/public-share`));
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Paylaşım bilgileri yüklenemedi.',
      });
      setPublicShareOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function savePublicShare() {
    if (!detail) return;
    setBusy(true);
    try {
      const expiresAt = publicExpiresAt ? new Date(publicExpiresAt).toISOString() : null;
      const result = await request<PublicShare>(`/v1/admin/readings/${detail.id}/public-share`, {
        method: publicShare ? 'PATCH' : 'POST',
        headers: csrfHeaders(true),
        body: JSON.stringify({
          ...(publicShare ? { expectedVersion: publicShare.version } : {}),
          slug: publicSlug,
          allowPdf: publicAllowPdf,
          allowIndexing: publicAllowIndexing,
          expiresAt,
        }),
      });
      applyPublicShare(result);
      await loadReadings(detail.id);
      await loadDetail(detail.id);
      setNotice({
        tone: 'success',
        text: publicShare ? 'Genel paylaşım güncellendi.' : 'Genel bağlantı oluşturuldu.',
      });
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Genel paylaşım kaydedilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function changePublicShareStatus(status: PublicShare['status']) {
    if (!detail || !publicShare) return;
    setBusy(true);
    try {
      const result = await request<PublicShare>(`/v1/admin/readings/${detail.id}/public-share`, {
        method: 'PATCH',
        headers: csrfHeaders(true),
        body: JSON.stringify({ expectedVersion: publicShare.version, status }),
      });
      applyPublicShare(result);
      await loadReadings(detail.id);
      await loadDetail(detail.id);
      setNotice({
        tone: 'success',
        text: status === 'ACTIVE' ? 'Genel bağlantı yeniden açıldı.' : 'Genel bağlantı durduruldu.',
      });
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Paylaşım durumu değiştirilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyPublicLink(instagram = false) {
    if (!publicShare) return;
    const url = new URL(publicShare.publicUrl);
    if (instagram) {
      url.searchParams.set('utm_source', 'instagram');
      url.searchParams.set('utm_medium', 'social');
    }
    await navigator.clipboard.writeText(url.toString());
    setNotice({
      tone: 'success',
      text: instagram ? 'Instagram bağlantısı kopyalandı.' : 'Genel bağlantı kopyalandı.',
    });
  }

  return (
    <main className="content readings-page">
      <PageHeader
        title="Okumalar"
        description="Öğrencilere bölümlü okumalar atayın ve ilerlemelerini takip edin."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload aria-hidden="true" /> Yeni okuma
          </Button>
        }
      />

      {error ? (
        <div className="reading-error-state">
          <Alert tone="danger" title="Okumalar yüklenemedi">
            {error}
          </Alert>
          <Button variant="secondary" onClick={() => void loadReadings()}>
            <RefreshCw aria-hidden="true" /> Yeniden dene
          </Button>
        </div>
      ) : !readings ? (
        <div className="reading-skeleton-list">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} />
          ))}
        </div>
      ) : readings.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Henüz okuma yok"
          description="Markdown içeriğini yükleyerek ilk öğrenci okumasını oluşturun."
          action={<Button onClick={() => setUploadOpen(true)}>İlk okumayı yükle</Button>}
        />
      ) : (
        <div className="readings-workspace">
          <aside className="readings-library panel">
            <div className="readings-library-head">
              <div>
                <span className="eyebrow">Kütüphane</span>
                <strong>{readings.length} okuma</strong>
              </div>
              <Button
                variant="ghost"
                aria-label="Okuma listesini yenile"
                title="Yenile"
                onClick={() => void loadReadings()}
              >
                <RefreshCw aria-hidden="true" />
              </Button>
            </div>
            <label className="readings-search">
              <Search aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Okuma ara"
              />
            </label>
            <div className="readings-list">
              {filteredReadings.map((reading) => (
                <button
                  type="button"
                  key={reading.id}
                  className={selectedId === reading.id ? 'is-active' : undefined}
                  onClick={() => {
                    if (reading.id !== selectedId && !discardContentChanges()) return;
                    setSelectedId(reading.id);
                    setActiveSection(0);
                  }}
                >
                  <span className="reading-list-icon">
                    <FileText aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{reading.title}</strong>
                    <small>
                      {reading._count.sections} bölüm · {reading.estimatedMinutes} dk
                    </small>
                  </span>
                  <Badge
                    tone={
                      reading.status === 'PUBLISHED'
                        ? 'success'
                        : reading.status === 'ARCHIVED'
                          ? 'neutral'
                          : 'info'
                    }
                  >
                    {statusLabel(reading.status)}
                  </Badge>
                </button>
              ))}
            </div>
          </aside>

          <section className="reading-admin panel">
            {loadingDetail || !detail ? (
              <div className="reading-skeleton-list">
                {Array.from({ length: 10 }, (_, index) => (
                  <Skeleton key={index} />
                ))}
              </div>
            ) : (
              <>
                <header className="reading-admin-head">
                  <div>
                    <div className="reading-title-line">
                      <Badge
                        tone={
                          detail.status === 'PUBLISHED'
                            ? 'success'
                            : detail.status === 'ARCHIVED'
                              ? 'neutral'
                              : 'info'
                        }
                      >
                        {statusLabel(detail.status)}
                      </Badge>
                      <span>
                        {detail.sections.length} bölüm ·{' '}
                        {detail.sections.reduce((sum, section) => sum + section.wordCount, 0)}{' '}
                        kelime
                      </span>
                    </div>
                    <h2>{detail.title}</h2>
                  </div>
                  <div className="reading-admin-actions">
                    {editingContent ? (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => void discardContentChanges()}
                          disabled={busy}
                        >
                          <X aria-hidden="true" /> Vazgeç
                        </Button>
                        <Button
                          onClick={() => void saveContent()}
                          disabled={busy || !contentChanged}
                        >
                          <Save aria-hidden="true" /> {busy ? 'Kaydediliyor...' : 'Metni kaydet'}
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" onClick={beginContentEdit} disabled={busy}>
                        <Pencil aria-hidden="true" /> Metni düzenle
                      </Button>
                    )}
                    {!editingContent && detail.status === 'DRAFT' ? (
                      <Button onClick={() => void changeStatus('PUBLISHED')} disabled={busy}>
                        <Check aria-hidden="true" /> Yayınla
                      </Button>
                    ) : !editingContent && detail.status === 'PUBLISHED' ? (
                      <>
                        <Button onClick={() => void openAssignment()} disabled={busy}>
                          <Send aria-hidden="true" /> Öğrenciye ata
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => void changeStatus('ARCHIVED')}
                          disabled={busy}
                        >
                          <Archive aria-hidden="true" /> Arşivle
                        </Button>
                      </>
                    ) : null}
                    {!editingContent && (detail.status === 'PUBLISHED' || detail.publicShare) ? (
                      <Button
                        variant="secondary"
                        onClick={() => void openPublicShare()}
                        disabled={busy}
                      >
                        <Globe2 aria-hidden="true" />
                        {detail.publicShare ? 'Genel paylaşım' : 'Herkese açık paylaş'}
                      </Button>
                    ) : null}
                    {!editingContent ? (
                      <Button variant="danger" onClick={() => setDeleteOpen(true)} disabled={busy}>
                        <Trash2 aria-hidden="true" /> Sil
                      </Button>
                    ) : null}
                  </div>
                </header>

                {!editingContent ? (
                  <>
                    <div className="reading-metadata">
                      <TextField
                        label="Başlık"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                      />
                      <TextField
                        label="Yazar"
                        value={author}
                        onChange={(event) => setAuthor(event.target.value)}
                      />
                      <TextField
                        label="Tahmini süre"
                        type="number"
                        min={1}
                        max={600}
                        value={estimatedMinutes}
                        onChange={(event) => setEstimatedMinutes(event.target.value)}
                      />
                      <label className="ui-field reading-description-field">
                        <span>Açıklama</span>
                        <textarea
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          rows={2}
                        />
                      </label>
                      <div className="admin-cover-image-field">
                        <div className="admin-cover-image-preview">
                          {detail.coverImageMimeType ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`${api}/v1/admin/readings/${detail.id}/cover-image?v=${detail.version}`}
                              alt={coverImageAlt || detail.title}
                            />
                          ) : (
                            <span>Editorial fallback kullanılacak</span>
                          )}
                        </div>
                        <div className="admin-cover-image-controls">
                          <TextField
                            label="Kapak görseli alt metni"
                            value={coverImageAlt}
                            onChange={(event) => setCoverImageAlt(event.target.value)}
                            maxLength={500}
                          />
                          <input
                            ref={coverInput}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={busy || editingContent}
                            onChange={(event) =>
                              void uploadCoverImage(event.currentTarget.files?.[0])
                            }
                          />
                          <div className="admin-cover-image-actions">
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy || editingContent}
                              onClick={() => coverInput.current?.click()}
                            >
                              <Upload aria-hidden="true" />
                              {detail.coverImageMimeType ? 'Görseli değiştir' : 'Görsel yükle'}
                            </Button>
                            {detail.coverImageMimeType ? (
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy || editingContent}
                                onClick={() => void removeCoverImage()}
                              >
                                Görseli kaldır
                              </Button>
                            ) : null}
                          </div>
                          <small>JPEG, PNG veya WebP · en fazla 8 MiB</small>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => void saveMetadata()}
                        disabled={busy || editingContent}
                      >
                        <Save aria-hidden="true" /> Bilgileri kaydet
                      </Button>
                    </div>

                    <div className="reading-source-strip">
                      <span>
                        <FileText aria-hidden="true" />
                        {detail.sourceFilename} · {formatBytes(detail.sourceByteSize)}
                      </span>
                      <span>
                        <Eye aria-hidden="true" />
                        PDF:{' '}
                        {detail.pdfFilename
                          ? `${detail.pdfFilename} · ${formatBytes(detail.pdfByteSize)}`
                          : 'eklenmedi'}
                      </span>
                    </div>
                  </>
                ) : null}

                <div className="reading-preview">
                  <nav aria-label="Okuma bölümleri">
                    {detail.sections.map((section, index) => (
                      <button
                        type="button"
                        key={section.id}
                        className={activeSection === index ? 'is-active' : undefined}
                        onClick={() => setActiveSection(index)}
                      >
                        <span>{String(section.position).padStart(2, '0')}</span>
                        <strong>
                          {(editingContent ? contentDraft[index]?.title : section.title) ??
                            section.title}
                        </strong>
                        <small>
                          {(editingContent ? contentDraft[index]?.wordCount : section.wordCount) ??
                            section.wordCount}{' '}
                          kelime
                        </small>
                      </button>
                    ))}
                  </nav>
                  <article className="reading-preview-content">
                    {editingContent ? (
                      <>
                        <div className="reading-content-edit-head">
                          <span className="eyebrow">
                            Bölüm {contentDraft[activeSection]?.position}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setContentPreview((current) => !current)}
                          >
                            <Eye aria-hidden="true" />
                            {contentPreview ? 'Düzenlemeye dön' : 'Önizle'}
                          </Button>
                        </div>
                        {detail.pdfFilename ? (
                          <Alert tone="info" title="PDF ayrı tutulur">
                            Buradaki değişiklik web okumasını günceller; bağlı PDF dosyası değişmez.
                          </Alert>
                        ) : null}
                        {contentPreview ? (
                          <div className="reading-content-live-preview">
                            <h3>{contentDraft[activeSection]?.title}</h3>
                            <ReactMarkdown skipHtml disallowedElements={['img']}>
                              {contentDraft[activeSection]?.contentMarkdown ?? ''}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="reading-content-editor">
                            <label className="ui-field">
                              <span>Bölüm başlığı</span>
                              <input
                                value={contentDraft[activeSection]?.title ?? ''}
                                maxLength={240}
                                onChange={(event) => {
                                  const section = contentDraft[activeSection];
                                  if (section)
                                    updateDraftSection(section.id, 'title', event.target.value);
                                }}
                              />
                            </label>
                            <label className="ui-field">
                              <span>Markdown içeriği</span>
                              <textarea
                                value={contentDraft[activeSection]?.contentMarkdown ?? ''}
                                spellCheck
                                onChange={(event) => {
                                  const section = contentDraft[activeSection];
                                  if (section)
                                    updateDraftSection(
                                      section.id,
                                      'contentMarkdown',
                                      event.target.value,
                                    );
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="eyebrow">
                          Bölüm {detail.sections[activeSection]?.position}
                        </span>
                        <h3>{detail.sections[activeSection]?.title}</h3>
                        <ReactMarkdown skipHtml disallowedElements={['img']}>
                          {detail.sections[activeSection]?.contentMarkdown ?? ''}
                        </ReactMarkdown>
                      </>
                    )}
                  </article>
                </div>

                <section className="reading-assignments">
                  <header>
                    <div>
                      <span className="eyebrow">Öğrenci ilerlemesi</span>
                      <h3>{detail.assignments.length} atama</h3>
                    </div>
                    {detail.status === 'PUBLISHED' ? (
                      <Button variant="secondary" onClick={() => void openAssignment()}>
                        <Users aria-hidden="true" /> Öğrenci seç
                      </Button>
                    ) : null}
                  </header>
                  {detail.assignments.length === 0 ? (
                    <p className="reading-muted">Bu okuma henüz bir öğrenciye atanmadı.</p>
                  ) : (
                    <div className="reading-assignment-list">
                      {detail.assignments.map((assignment) => (
                        <article key={assignment.id}>
                          <div>
                            <strong>
                              {assignment.student.fullName ?? assignment.student.id.slice(0, 8)}
                            </strong>
                            <small>{formatDate(assignment.assignedAt)}</small>
                          </div>
                          <div className="reading-progress-cell">
                            <span>
                              <i style={{ width: `${assignment.progressPercent}%` }} />
                            </span>
                            <small>%{assignment.progressPercent}</small>
                          </div>
                          <Badge
                            tone={
                              assignment.status === 'COMPLETED'
                                ? 'success'
                                : assignment.status === 'OPENED'
                                  ? 'info'
                                  : 'neutral'
                            }
                          >
                            {
                              {
                                ASSIGNED: 'Atandı',
                                OPENED: 'Okuyor',
                                COMPLETED: 'Tamamladı',
                              }[assignment.status]
                            }
                          </Badge>
                          {assignment.response ? (
                            <p className="reading-response">{assignment.response}</p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        </div>
      )}

      {uploadOpen ? (
        <Modal
          onClose={() => setUploadOpen(false)}
          title="Yeni okuma yükle"
          description="Markdown veya PDF yükleyin. PDF tek başına yüklenirse metin otomatik çıkarılır."
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setUploadOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" form="reading-upload-form" disabled={busy}>
                <Upload aria-hidden="true" /> {busy ? 'Yükleniyor...' : 'Taslak oluştur'}
              </Button>
            </>
          }
        >
          <form
            id="reading-upload-form"
            ref={uploadForm}
            className="reading-upload-form"
            onSubmit={uploadReading}
          >
            <TextField label="Başlık (isteğe bağlı)" name="title" maxLength={200} />
            <TextField label="Yazar" name="author" defaultValue="Necip Sülbü" maxLength={160} />
            <label className="ui-field">
              <span>Kısa açıklama</span>
              <textarea name="description" rows={3} maxLength={2000} />
            </label>
            <TextField
              label="Kapak görseli alt metni (isteğe bağlı)"
              name="coverImageAlt"
              maxLength={500}
            />
            <div className="reading-upload-grid">
              <label className="reading-file-input">
                <FileText aria-hidden="true" />
                <span>
                  <strong>Markdown</strong>
                  <small>.md veya .markdown · isteğe bağlı</small>
                </span>
                <input name="markdown" type="file" accept=".md,.markdown,text/markdown" />
              </label>
              <label className="reading-file-input">
                <Eye aria-hidden="true" />
                <span>
                  <strong>PDF</strong>
                  <small>Tek başına yüklenebilir · en fazla 25 MB</small>
                </span>
                <input name="pdf" type="file" accept=".pdf,application/pdf" />
              </label>
              <label className="reading-file-input">
                <Upload aria-hidden="true" />
                <span>
                  <strong>Kapak görseli</strong>
                  <small>JPEG, PNG veya WebP · en fazla 8 MiB · isteğe bağlı</small>
                </span>
                <input name="coverImage" type="file" accept="image/jpeg,image/png,image/webp" />
              </label>
            </div>
            <div className="reading-upload-grid reading-upload-options">
              <TextField
                label="Hedef bölüm sayısı"
                name="targetSectionCount"
                type="number"
                min={1}
                max={20}
                defaultValue="5"
              />
              <TextField
                label="Tahmini dakika (boşsa otomatik)"
                name="estimatedMinutes"
                type="number"
                min={1}
                max={600}
              />
            </div>
          </form>
        </Modal>
      ) : null}

      {assignOpen ? (
        <Modal
          onClose={() => setAssignOpen(false)}
          title="Öğrencilere ata"
          description="Bağlantı öğrencinin varsayılan mesaj kanalına gönderilir."
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>
                Vazgeç
              </Button>
              <Button
                type="button"
                disabled={busy || selectedStudents.length === 0}
                onClick={() => void assignReading()}
              >
                <Send aria-hidden="true" /> {selectedStudents.length} öğrenciye gönder
              </Button>
            </>
          }
        >
          <div className="reading-student-picker">
            <label className="readings-search">
              <Search aria-hidden="true" />
              <input
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder="Öğrenci ara"
              />
            </label>
            <div>
              {filteredStudents.map((student) => (
                <label key={student.id}>
                  <input
                    type="checkbox"
                    checked={selectedStudents.includes(student.id)}
                    onChange={(event) =>
                      setSelectedStudents((current) =>
                        event.target.checked
                          ? [...current, student.id]
                          : current.filter((id) => id !== student.id),
                      )
                    }
                  />
                  <span>
                    <strong>{student.fullName ?? student.id.slice(0, 8)}</strong>
                    <small>{student.channel?.type ?? 'Kanal yok'}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {publicShareOpen && detail ? (
        <Modal
          onClose={() => setPublicShareOpen(false)}
          title="Herkese açık paylaşım"
          description="Instagram ve diğer kanallarda paylaşılabilen anonim okuma bağlantısını yönetin."
          actions={
            <div className="reading-public-actions">
              {publicShare ? (
                publicShare.status === 'ACTIVE' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void changePublicShareStatus('PAUSED')}
                  >
                    <PauseCircle aria-hidden="true" /> Yayını durdur
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void changePublicShareStatus('ACTIVE')}
                  >
                    <PlayCircle aria-hidden="true" /> Yeniden aç
                  </Button>
                )
              ) : null}
              <Button
                type="button"
                disabled={busy || publicSlug.length < 3}
                onClick={() => void savePublicShare()}
              >
                <Save aria-hidden="true" />
                {publicShare ? 'Ayarları kaydet' : 'Bağlantı oluştur'}
              </Button>
            </div>
          }
        >
          <div className="reading-public-share">
            {publicShare ? (
              <>
                <div className="reading-public-link">
                  <div>
                    <span className="eyebrow">Genel bağlantı</span>
                    <strong>{publicShare.publicUrl}</strong>
                  </div>
                  <Badge tone={publicShare.effectiveStatus === 'ACTIVE' ? 'success' : 'neutral'}>
                    {
                      {
                        ACTIVE: 'Erişime açık',
                        PAUSED: 'Durduruldu',
                        EXPIRED: 'Süresi doldu',
                        READING_UNAVAILABLE: 'Okuma yayında değil',
                      }[publicShare.effectiveStatus]
                    }
                  </Badge>
                  <div>
                    <Button
                      variant="secondary"
                      title="Genel bağlantıyı kopyala"
                      onClick={() => void copyPublicLink()}
                    >
                      <Copy aria-hidden="true" /> Kopyala
                    </Button>
                    <Button
                      variant="secondary"
                      title="Bağlantıyı yeni sekmede aç"
                      onClick={() =>
                        window.open(publicShare.publicUrl, '_blank', 'noopener,noreferrer')
                      }
                    >
                      <ExternalLink aria-hidden="true" /> Aç
                    </Button>
                  </div>
                </div>

                <section className="reading-public-analytics">
                  <header>
                    <div>
                      <BarChart3 aria-hidden="true" />
                      <div>
                        <span className="eyebrow">Anonim istatistikler</span>
                        <strong>Okuma performansı</strong>
                      </div>
                    </div>
                    <small>Aktif okuyucu: son 5 dakika</small>
                  </header>
                  <div>
                    <article>
                      <span>Toplam açılış</span>
                      <strong>{publicShare.metrics.totalViews}</strong>
                    </article>
                    <article>
                      <span>PDF açılışı</span>
                      <strong>{publicShare.metrics.totalPdfDownloads}</strong>
                    </article>
                    <article>
                      <span>WhatsApp geçişi</span>
                      <strong>{publicShare.metrics.whatsappClicks}</strong>
                    </article>
                    <article>
                      <span>Tekil okuyucu</span>
                      <strong>{publicShare.metrics.uniqueReaders}</strong>
                    </article>
                    <article>
                      <span>Şu an okuyor</span>
                      <strong>{publicShare.metrics.activeReaders}</strong>
                    </article>
                    <article>
                      <span>Tamamlayan</span>
                      <strong>{publicShare.metrics.completedReaders}</strong>
                    </article>
                    <article>
                      <span>Ort. ilerleme</span>
                      <strong>%{publicShare.metrics.averageProgress}</strong>
                    </article>
                    <article>
                      <span>Tamamlanma</span>
                      <strong>%{publicShare.metrics.completionRate}</strong>
                    </article>
                  </div>
                  {publicShare.metrics.sources.length ? (
                    <div className="reading-public-sources">
                      <span className="eyebrow">Kaynaklar</span>
                      {publicShare.metrics.sources.map((source) => (
                        <div
                          key={`${source.source}:${source.medium ?? ''}:${source.campaign ?? ''}`}
                        >
                          <strong>
                            {source.source}
                            {source.medium ? ` · ${source.medium}` : ''}
                            {source.campaign ? ` · ${source.campaign}` : ''}
                          </strong>
                          <span>
                            {source.uniqueReaders} okuyucu · {source.totalViews} açılış
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            ) : (
              <Alert tone="info">
                Bağlantı oluşturulduğunda öğrenci bilgisi olmadan herkese açık biçimde okunabilir.
              </Alert>
            )}

            <div className="reading-public-settings">
              <TextField
                label="Bağlantı adı"
                value={publicSlug}
                onChange={(event) => setPublicSlug(slugify(event.target.value))}
                maxLength={100}
              />
              <TextField
                label="Son kullanma tarihi (isteğe bağlı)"
                type="datetime-local"
                value={publicExpiresAt}
                onChange={(event) => setPublicExpiresAt(event.target.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={publicAllowPdf}
                  disabled={!detail.pdfFilename}
                  onChange={(event) => setPublicAllowPdf(event.target.checked)}
                />
                <span>
                  <strong>PDF erişimine izin ver</strong>
                  <small>
                    {detail.pdfFilename
                      ? 'Genel okuyucular ek PDF dosyasını açabilir.'
                      : 'Bu okumada PDF bulunmuyor.'}
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={publicAllowIndexing}
                  onChange={(event) => setPublicAllowIndexing(event.target.checked)}
                />
                <span>
                  <strong>Arama motorlarında göster</strong>
                  <small>Kapalıysa bağlantıyı bilenler yine okumayı açabilir.</small>
                </span>
              </label>
            </div>

            {publicShare ? (
              <div className="reading-instagram-link">
                <Globe2 aria-hidden="true" />
                <div>
                  <strong>Instagram paylaşımı</strong>
                  <span>Kaynak bilgisi eklenmiş bağlantıyla Instagram trafiği ayrı ölçülür.</span>
                </div>
                <Button variant="secondary" onClick={() => void copyPublicLink(true)}>
                  <Copy aria-hidden="true" /> Instagram linki
                </Button>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {deleteOpen && detail ? (
        <Modal
          onClose={() => setDeleteOpen(false)}
          title="Okumayı sil"
          description={
            detail.assignments.length > 0 || detail.publicShare
              ? 'Atama, ilerleme ve paylaşım istatistiklerini korumak için bu okuma silinemez.'
              : 'Bu işlem okuma içeriğini ve yüklenen dosyaları kalıcı olarak siler.'
          }
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
                Vazgeç
              </Button>
              {detail.assignments.length > 0 || detail.publicShare ? (
                detail.status !== 'ARCHIVED' ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setDeleteOpen(false);
                      void changeStatus('ARCHIVED');
                    }}
                    disabled={busy}
                  >
                    <Archive aria-hidden="true" /> Arşivle
                  </Button>
                ) : null
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  loading={busy}
                  onClick={() => void deleteReading()}
                >
                  <Trash2 aria-hidden="true" /> Kalıcı olarak sil
                </Button>
              )}
            </>
          }
        >
          <div className="reading-delete-confirmation">
            <strong>{detail.title}</strong>
            {detail.assignments.length > 0 || detail.publicShare ? (
              <Alert tone="warning">
                {detail.assignments.length > 0
                  ? `Bu okuma ${detail.assignments.length} öğrenciye atanmış. `
                  : ''}
                {detail.publicShare ? 'Okumanın herkese açık bağlantısı bulunuyor. ' : ''}
                Kalıcı silme yerine okumayı arşivleyin.
              </Alert>
            ) : (
              <p>Bu işlemi geri alamazsınız. Okumayı kalıcı olarak silmek istiyor musunuz?</p>
            )}
          </div>
        </Modal>
      ) : null}

      {resultsOpen ? (
        <Modal
          onClose={() => setResultsOpen(false)}
          title="Paylaşım sonuçları"
          description="Mesaj gönderilemese bile öğrenci bağlantısını manuel paylaşabilirsiniz."
        >
          <div className="reading-share-results">
            {assignmentResults.map((result) => {
              const student = students.find((item) => item.id === result.studentId);
              return (
                <article key={result.studentId}>
                  <div>
                    <strong>{student?.fullName ?? result.studentId.slice(0, 8)}</strong>
                    <small>
                      {result.sent
                        ? 'Mesaj kuyruğa alındı'
                        : result.completed
                          ? 'Daha önce tamamlandı'
                          : result.error}
                    </small>
                  </div>
                  {result.readingUrl ? (
                    <Button
                      variant="secondary"
                      onClick={() => void copyLink(result.readingUrl)}
                      title="Bağlantıyı kopyala"
                    >
                      <Link2 aria-hidden="true" /> Kopyala
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </Modal>
      ) : null}

      {notice ? (
        <Toast tone={notice.tone} onDismiss={() => setNotice(undefined)}>
          {notice.text}
        </Toast>
      ) : null}
    </main>
  );
}

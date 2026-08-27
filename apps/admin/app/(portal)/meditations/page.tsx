'use client';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TextField,
  Toast,
} from '@meditation/ui';
import {
  Archive,
  AudioLines,
  BarChart3,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  FileAudio,
  Globe2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const standardDurations = [15, 20, 25, 30];

type MeditationLevel = 'INTRODUCTION' | 'INTERMEDIATE' | 'ADVANCED';
type MeditationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type GuidanceMode = 'SILENT' | 'GUIDED';
type RenderStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
type AudioAsset = {
  id: string;
  kind: 'OPENING' | 'CLOSING';
  version: number;
  filename: string;
  byteSize: number;
  durationSeconds?: number | null;
  createdAt: string;
};
type AudioRender = {
  id: string;
  sourceVersion: number;
  durationMinutes: number;
  status: RenderStatus;
  byteSize?: number | null;
  actualDurationSeconds?: number | null;
  attempts: number;
  errorCode?: string | null;
  renderedAt?: string | null;
};
type MeditationType = {
  id: string;
  title: string;
  description?: string | null;
  level: MeditationLevel;
  status: MeditationStatus;
  guidanceMode: GuidanceMode;
  targetDurations: number[];
  audioRevision: number;
  version: number;
  updatedAt: string;
  coverImageMimeType?: string | null;
  coverImageAlt?: string | null;
  coverImageByteSize?: number | null;
  openingAudio?: AudioAsset | null;
  closingAudio?: AudioAsset | null;
  audioAssets?: AudioAsset[];
  renders: AudioRender[];
  publicShare?: { id: string } | null;
};
type PublicShare = {
  id: string;
  slug: string;
  status: 'ACTIVE' | 'PAUSED';
  effectiveStatus: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'MEDITATION_UNAVAILABLE';
  allowedDurations: number[];
  defaultDurationMinutes: number;
  allowDurationSelection: boolean;
  allowIndexing: boolean;
  expiresAt?: string | null;
  version: number;
  publicUrl: string;
  metrics: {
    totalViews: number;
    uniqueVisitors: number;
    starts: number;
    completions: number;
    completionRate: number;
    ctaViews: number;
    ctaClicks: number;
    ctaClickRate: number;
    completedMinutes: number;
    durations: Array<{
      durationMinutes: number;
      uniqueVisitors: number;
      views: number;
      starts: number;
      completions: number;
    }>;
  };
};
type Notice = { tone: 'success' | 'danger' | 'info'; text: string };

function reconcileShareDurations(
  targetDurations: number[],
  allowedDurations: number[],
  defaultDurationMinutes: number,
) {
  const targetSet = new Set(targetDurations);
  const retainedDurations = [...new Set(allowedDurations)]
    .filter((duration) => targetSet.has(duration))
    .sort((left, right) => left - right);
  const nextAllowedDurations = retainedDurations.length
    ? retainedDurations
    : targetDurations.slice(0, 1);
  return {
    allowedDurations: nextAllowedDurations,
    defaultDurationMinutes: nextAllowedDurations.includes(defaultDurationMinutes)
      ? defaultDurationMinutes
      : (nextAllowedDurations[0] ?? 15),
  };
}

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

function levelLabel(value: MeditationLevel) {
  return {
    INTRODUCTION: 'Başlangıç',
    INTERMEDIATE: 'Intermediate',
    ADVANCED: 'Advanced',
  }[value];
}

function statusLabel(value: MeditationStatus) {
  return { DRAFT: 'Taslak', PUBLISHED: 'Yayında', ARCHIVED: 'Arşivde' }[value];
}

function renderLabel(value: RenderStatus) {
  return {
    PENDING: 'Sırada',
    PROCESSING: 'Hazırlanıyor',
    READY: 'Hazır',
    FAILED: 'Hatalı',
  }[value];
}

function renderTone(value: RenderStatus): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  return {
    PENDING: 'neutral',
    PROCESSING: 'info',
    READY: 'success',
    FAILED: 'danger',
  }[value] as 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

function formatBytes(value?: number | null) {
  if (!value) return '—';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAudioDuration(value?: number | null) {
  if (!value) return 'İşlenince hesaplanacak';
  const rounded = Math.round(value);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
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

function localDateTimeValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function MeditationsPage() {
  const [items, setItems] = useState<MeditationType[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<MeditationType>();
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<MeditationLevel>('INTRODUCTION');
  const [guidanceMode, setGuidanceMode] = useState<GuidanceMode>('SILENT');
  const [durations, setDurations] = useState<number[]>(standardDurations);
  const [customDuration, setCustomDuration] = useState('');
  const [coverImageAlt, setCoverImageAlt] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [publicShareOpen, setPublicShareOpen] = useState(false);
  const [publicShare, setPublicShare] = useState<PublicShare>();
  const [shareSlug, setShareSlug] = useState('');
  const [shareDurations, setShareDurations] = useState<number[]>(standardDurations);
  const [shareDefaultDuration, setShareDefaultDuration] = useState(15);
  const [shareAllowsSelection, setShareAllowsSelection] = useState(true);
  const [shareAllowsIndexing, setShareAllowsIndexing] = useState(false);
  const [shareExpiresAt, setShareExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const openingInput = useRef<HTMLInputElement>(null);
  const closingInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(async (preferredId?: string) => {
    setError(undefined);
    try {
      const result = await request<MeditationType[]>('/v1/admin/meditations');
      setItems(result);
      setSelectedId((current) => {
        const candidate = preferredId ?? current;
        if (candidate && result.some((item) => item.id === candidate)) return candidate;
        return result[0]?.id;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Meditasyonlar yüklenemedi.');
    }
  }, []);

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingDetail(true);
    try {
      const result = await request<MeditationType>(`/v1/admin/meditations/${id}`);
      setDetail(result);
      setTitle(result.title);
      setDescription(result.description ?? '');
      setLevel(result.level);
      setGuidanceMode(result.guidanceMode);
      setDurations(result.targetDurations);
      setCoverImageAlt(result.coverImageAlt ?? '');
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Meditasyon açılamadı.',
      });
    } finally {
      if (!quiet) setLoadingDetail(false);
    }
  }, []);

  const loadPublicShare = useCallback(async (meditation: MeditationType) => {
    if (!meditation.publicShare) {
      setPublicShare(undefined);
      setShareSlug(slugify(meditation.title));
      setShareDurations(meditation.targetDurations);
      setShareDefaultDuration(meditation.targetDurations[0] ?? 15);
      setShareAllowsSelection(true);
      setShareAllowsIndexing(false);
      setShareExpiresAt('');
      return;
    }
    try {
      const share = await request<PublicShare>(
        `/v1/admin/meditations/${meditation.id}/public-share`,
      );
      const reconciled = reconcileShareDurations(
        meditation.targetDurations,
        share.allowedDurations,
        share.defaultDurationMinutes,
      );
      setPublicShare(share);
      setShareSlug(share.slug);
      setShareDurations(reconciled.allowedDurations);
      setShareDefaultDuration(reconciled.defaultDurationMinutes);
      setShareAllowsSelection(share.allowDurationSelection);
      setShareAllowsIndexing(share.allowIndexing);
      setShareExpiresAt(localDateTimeValue(share.expiresAt));
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Paylaşım bilgileri yüklenemedi.',
      });
    }
  }, []);

  useEffect(() => void loadItems(), [loadItems]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(undefined);
  }, [loadDetail, selectedId]);
  useEffect(() => {
    if (detail) void loadPublicShare(detail);
  }, [detail, loadPublicShare]);
  useEffect(() => {
    if (!detail?.renders.some((item) => item.status === 'PENDING' || item.status === 'PROCESSING'))
      return;
    const timer = window.setInterval(() => {
      void loadDetail(detail.id, true);
      void loadItems(detail.id);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [detail, loadDetail, loadItems]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');
    if (!normalized) return items ?? [];
    return (items ?? []).filter((item) =>
      `${item.title} ${item.description ?? ''}`.toLocaleLowerCase('tr-TR').includes(normalized),
    );
  }, [items, query]);
  const currentRenders = useMemo(
    () =>
      detail?.renders
        .filter((render) => render.sourceVersion === detail.audioRevision)
        .sort((left, right) => left.durationMinutes - right.durationMinutes) ?? [],
    [detail],
  );

  async function createMeditation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const coverImage = form.get('coverImage');
    const coverImageAlt = String(form.get('coverImageAlt') ?? '');
    setBusy(true);
    try {
      const created = await request<MeditationType>('/v1/admin/meditations', {
        method: 'POST',
        headers: csrfHeaders(true),
        body: JSON.stringify({
          title: form.get('title'),
          description: form.get('description') || undefined,
          level: form.get('level'),
          guidanceMode: form.get('guidanceMode'),
          targetDurations: standardDurations,
        }),
      });
      let coverImageError: string | undefined;
      if (coverImage instanceof File && coverImage.size > 0) {
        const coverBody = new FormData();
        coverBody.set('coverImage', coverImage);
        coverBody.set('expectedVersion', String(created.version));
        coverBody.set('coverImageAlt', coverImageAlt);
        try {
          await request(`/v1/admin/meditations/${created.id}/cover-image`, {
            method: 'POST',
            headers: csrfHeaders(),
            body: coverBody,
          });
        } catch (reason) {
          coverImageError = reason instanceof Error ? reason.message : 'Kapak görseli yüklenemedi.';
        }
      }
      setCreateOpen(false);
      await loadItems(created.id);
      setNotice(
        coverImageError
          ? { tone: 'info', text: `Meditasyon oluşturuldu; ${coverImageError}` }
          : { tone: 'success', text: 'Meditasyon türü oluşturuldu.' },
      );
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Meditasyon oluşturulamadı.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!detail) return;
    setBusy(true);
    try {
      await request(`/v1/admin/meditations/${detail.id}`, {
        method: 'PATCH',
        headers: csrfHeaders(true),
        body: JSON.stringify({
          expectedVersion: detail.version,
          title,
          description: description || null,
          level,
          guidanceMode,
          targetDurations: durations,
          coverImageAlt: coverImageAlt || null,
        }),
      });
      await Promise.all([loadDetail(detail.id), loadItems(detail.id)]);
      setNotice({ tone: 'success', text: 'Meditasyon bilgileri kaydedildi.' });
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
      await request(`/v1/admin/meditations/${detail.id}/cover-image`, {
        method: 'POST',
        headers: csrfHeaders(),
        body,
      });
      await Promise.all([loadDetail(detail.id), loadItems(detail.id)]);
      setNotice({ tone: 'success', text: 'Meditasyon kapak görseli güncellendi.' });
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
      await request(`/v1/admin/meditations/${detail.id}/cover-image`, {
        method: 'DELETE',
        headers: csrfHeaders(true),
        body: JSON.stringify({ expectedVersion: detail.version }),
      });
      await Promise.all([loadDetail(detail.id), loadItems(detail.id)]);
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

  async function changeStatus(status: MeditationStatus) {
    if (!detail) return;
    setBusy(true);
    try {
      await request(`/v1/admin/meditations/${detail.id}`, {
        method: 'PATCH',
        headers: csrfHeaders(true),
        body: JSON.stringify({ expectedVersion: detail.version, status }),
      });
      await Promise.all([loadDetail(detail.id), loadItems(detail.id)]);
      setNotice({
        tone: 'success',
        text: status === 'PUBLISHED' ? 'Meditasyon yayınlandı.' : 'Meditasyon arşivlendi.',
      });
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Durum değiştirilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeMeditation() {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await request<{ mode: 'DELETED' | 'ARCHIVED'; message: string }>(
        `/v1/admin/meditations/${detail.id}`,
        {
          method: 'DELETE',
          headers: csrfHeaders(true),
          body: JSON.stringify({ expectedVersion: detail.version }),
        },
      );
      setDeleteOpen(false);
      if (result.mode === 'DELETED') {
        setDetail(undefined);
        setSelectedId(undefined);
      }
      await loadItems();
      if (result.mode === 'ARCHIVED') await loadDetail(detail.id);
      setNotice({ tone: 'success', text: result.message });
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Meditasyon silinemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function savePublicShare() {
    if (!detail) return;
    const reconciled = reconcileShareDurations(
      detail.targetDurations,
      shareDurations,
      shareDefaultDuration,
    );
    setBusy(true);
    try {
      const payload = {
        slug: shareSlug,
        allowedDurations: reconciled.allowedDurations,
        defaultDurationMinutes: reconciled.defaultDurationMinutes,
        allowDurationSelection: shareAllowsSelection,
        allowIndexing: shareAllowsIndexing,
        expiresAt: shareExpiresAt ? new Date(shareExpiresAt).toISOString() : null,
      };
      const share = await request<PublicShare>(`/v1/admin/meditations/${detail.id}/public-share`, {
        method: publicShare ? 'PATCH' : 'POST',
        headers: csrfHeaders(true),
        body: JSON.stringify(
          publicShare ? { ...payload, expectedVersion: publicShare.version } : payload,
        ),
      });
      setPublicShare(share);
      setShareDurations(share.allowedDurations);
      setShareDefaultDuration(share.defaultDurationMinutes);
      await loadDetail(detail.id, true);
      setNotice({ tone: 'success', text: 'Herkese açık paylaşım ayarları kaydedildi.' });
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Paylaşım ayarları kaydedilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function changePublicShareStatus(status: 'ACTIVE' | 'PAUSED') {
    if (!detail || !publicShare) return;
    setBusy(true);
    try {
      const share = await request<PublicShare>(`/v1/admin/meditations/${detail.id}/public-share`, {
        method: 'PATCH',
        headers: csrfHeaders(true),
        body: JSON.stringify({ expectedVersion: publicShare.version, status }),
      });
      setPublicShare(share);
      setNotice({
        tone: 'success',
        text: status === 'ACTIVE' ? 'Global bağlantı açıldı.' : 'Global bağlantı durduruldu.',
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

  async function copyPublicUrl(duration?: number) {
    if (!publicShare) return;
    const url = new URL(publicShare.publicUrl);
    if (duration) url.searchParams.set('sure', String(duration));
    await navigator.clipboard.writeText(url.toString());
    setNotice({
      tone: 'success',
      text: duration ? `${duration} dakikalık bağlantı kopyalandı.` : 'Bağlantı kopyalandı.',
    });
  }

  async function uploadAudio(kind: 'OPENING' | 'CLOSING', file?: File) {
    if (!detail || !file) return;
    const body = new FormData();
    body.set('audio', file);
    setBusy(true);
    try {
      await request(`/v1/admin/meditations/${detail.id}/audio/${kind}`, {
        method: 'POST',
        headers: csrfHeaders(),
        body,
      });
      await Promise.all([loadDetail(detail.id), loadItems(detail.id)]);
      setNotice({
        tone: 'success',
        text: `${kind === 'OPENING' ? 'Başlangıç' : 'Bitiş'} sesi yüklendi; süre dosyaları hazırlanıyor.`,
      });
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Ses yüklenemedi.',
      });
    } finally {
      setBusy(false);
      if (openingInput.current) openingInput.current.value = '';
      if (closingInput.current) closingInput.current.value = '';
    }
  }

  async function retryRender(renderId: string) {
    if (!detail) return;
    setBusy(true);
    try {
      await request(`/v1/admin/meditations/${detail.id}/renders/${renderId}/retry`, {
        method: 'POST',
        headers: csrfHeaders(true),
        body: '{}',
      });
      await loadDetail(detail.id);
      setNotice({ tone: 'info', text: 'Ses yeniden hazırlama sırasına alındı.' });
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'İş yeniden başlatılamadı.',
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleDuration(duration: number) {
    setDurations((current) => {
      if (current.includes(duration)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== duration);
      }
      return [...current, duration].sort((left, right) => left - right);
    });
  }

  function addCustomDuration() {
    const duration = Number(customDuration);
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) {
      setNotice({ tone: 'danger', text: 'Özel süre 1 ile 180 dakika arasında olmalı.' });
      return;
    }
    setDurations((current) => [...new Set([...current, duration])].sort((a, b) => a - b));
    setCustomDuration('');
  }

  return (
    <main className="content meditations-page">
      <PageHeader
        title="Meditasyon Kütüphanesi"
        description="Meditasyon türlerini, yönlendirme seslerini ve süre dosyalarını yönetin."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" /> Yeni meditasyon
          </Button>
        }
      />

      {error ? (
        <div className="meditation-error-state">
          <Alert tone="danger" title="Kütüphane yüklenemedi">
            {error}
          </Alert>
          <Button variant="secondary" onClick={() => void loadItems()}>
            <RefreshCw aria-hidden="true" /> Yeniden dene
          </Button>
        </div>
      ) : !items ? (
        <div className="meditation-skeletons">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={AudioLines}
          title="Henüz meditasyon türü yok"
          description="İlk meditasyon türünü oluşturarak yönlendirme seslerini ekleyin."
          action={<Button onClick={() => setCreateOpen(true)}>İlk meditasyonu oluştur</Button>}
        />
      ) : (
        <div className="meditation-workspace">
          <aside className="meditation-library">
            <header>
              <div>
                <span>Kütüphane</span>
                <strong>{items.length} meditasyon</strong>
              </div>
              <Button
                size="icon"
                variant="ghost"
                title="Listeyi yenile"
                onClick={() => void loadItems(selectedId)}
              >
                <RefreshCw aria-hidden="true" />
              </Button>
            </header>
            <label className="meditation-search">
              <span className="sr-only">Meditasyon ara</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Meditasyon ara"
              />
            </label>
            <div className="meditation-list">
              {visibleItems.map((item) => {
                const ready = item.renders.filter(
                  (render) =>
                    render.sourceVersion === item.audioRevision && render.status === 'READY',
                ).length;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={item.id === selectedId ? 'is-active' : undefined}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="meditation-list-icon">
                      <AudioLines aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {levelLabel(item.level)} · {ready}/{item.targetDurations.length} hazır
                      </small>
                    </span>
                    <Badge tone={item.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                      {statusLabel(item.status)}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="meditation-editor">
            {loadingDetail || !detail ? (
              <div className="meditation-detail-loading">
                <Skeleton />
                <Skeleton />
                <Skeleton />
              </div>
            ) : (
              <>
                <header className="meditation-editor-head">
                  <div>
                    <span>MEDİTASYON TÜRÜ</span>
                    <h2>{detail.title}</h2>
                  </div>
                  <div>
                    <Badge tone={detail.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                      {statusLabel(detail.status)}
                    </Badge>
                    {detail.status !== 'ARCHIVED' ? (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void changeStatus('ARCHIVED')}
                      >
                        <Archive aria-hidden="true" /> Arşivle
                      </Button>
                    ) : null}
                    {detail.status !== 'PUBLISHED' ? (
                      <Button disabled={busy} onClick={() => void changeStatus('PUBLISHED')}>
                        <Check aria-hidden="true" /> Yayınla
                      </Button>
                    ) : null}
                    {detail.status === 'PUBLISHED' || detail.publicShare ? (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setPublicShareOpen(true)}
                      >
                        <Globe2 aria-hidden="true" />
                        {detail.publicShare ? 'Global paylaşım' : 'Herkese açık paylaş'}
                      </Button>
                    ) : null}
                    <Button variant="secondary" disabled={busy} onClick={() => setDeleteOpen(true)}>
                      <Trash2 aria-hidden="true" /> Sil
                    </Button>
                  </div>
                </header>

                <section className="meditation-settings">
                  <TextField
                    label="Meditasyon adı"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <label className="ui-field meditation-description">
                    <span className="ui-field__label">Kısa açıklama</span>
                    <textarea
                      className="ui-input"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={3}
                    />
                  </label>
                  <div className="meditation-level-field">
                    <span>Seviye</span>
                    <SegmentedControl
                      label="Meditasyon seviyesi"
                      value={level}
                      options={[
                        { value: 'INTRODUCTION', label: 'Başlangıç' },
                        { value: 'INTERMEDIATE', label: 'Intermediate' },
                        { value: 'ADVANCED', label: 'Advanced' },
                      ]}
                      onChange={setLevel}
                    />
                  </div>
                  <div className="meditation-level-field">
                    <span>Oynatma biçimi</span>
                    <SegmentedControl
                      label="Meditasyon oynatma biçimi"
                      value={guidanceMode}
                      options={[
                        { value: 'SILENT', label: 'Sessiz sayaç' },
                        { value: 'GUIDED', label: 'Sesli yönlendirme' },
                      ]}
                      onChange={setGuidanceMode}
                    />
                    <small>
                      {guidanceMode === 'SILENT'
                        ? 'Ses dosyası olmadan sayaç ve bitiş çanı çalışır.'
                        : 'Yayınlamadan önce başlangıç sesi ve seçili süreler hazır olmalıdır.'}
                    </small>
                  </div>
                  <div className="meditation-duration-field">
                    <span>Üretilecek süreler</span>
                    <div>
                      {standardDurations.map((duration) => (
                        <label key={duration}>
                          <input
                            type="checkbox"
                            checked={durations.includes(duration)}
                            onChange={() => toggleDuration(duration)}
                          />
                          <span>{duration} dk</span>
                        </label>
                      ))}
                    </div>
                    <div className="meditation-custom-duration">
                      <input
                        className="ui-input"
                        type="number"
                        min="1"
                        max="180"
                        placeholder="Özel süre"
                        value={customDuration}
                        onChange={(event) => setCustomDuration(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addCustomDuration();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        title="Özel süre ekle"
                        onClick={addCustomDuration}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                    </div>
                    {durations.some((duration) => !standardDurations.includes(duration)) ? (
                      <div className="meditation-custom-duration-list">
                        {durations
                          .filter((duration) => !standardDurations.includes(duration))
                          .map((duration) => (
                            <span key={duration}>
                              {duration} dk
                              <button
                                type="button"
                                title={`${duration} dakikalık süreyi kaldır`}
                                aria-label={`${duration} dakikalık süreyi kaldır`}
                                onClick={() =>
                                  setDurations((current) =>
                                    current.length === 1
                                      ? current
                                      : current.filter((item) => item !== duration),
                                  )
                                }
                              >
                                <X aria-hidden="true" />
                              </button>
                            </span>
                          ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="admin-cover-image-field">
                    <div className="admin-cover-image-preview">
                      {detail.coverImageMimeType ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${api}/v1/admin/meditations/${detail.id}/cover-image?v=${detail.version}`}
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
                        onChange={(event) => void uploadCoverImage(event.currentTarget.files?.[0])}
                      />
                      <div className="admin-cover-image-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || detail.status === 'ARCHIVED'}
                          onClick={() => coverInput.current?.click()}
                        >
                          <Upload aria-hidden="true" />
                          {detail.coverImageMimeType ? 'Görseli değiştir' : 'Görsel yükle'}
                        </Button>
                        {detail.coverImageMimeType ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void removeCoverImage()}
                          >
                            Görseli kaldır
                          </Button>
                        ) : null}
                      </div>
                      <small>JPEG, PNG veya WebP · en fazla 8 MiB</small>
                    </div>
                  </div>
                  <Button loading={busy} onClick={() => void save()}>
                    <Save aria-hidden="true" /> Değişiklikleri kaydet
                  </Button>
                </section>

                <section className="meditation-audio-section">
                  <header>
                    <div>
                      <span>YÖNLENDİRME SESLERİ</span>
                      <h3>Başlangıç ve bitiş</h3>
                    </div>
                  </header>
                  <div className="meditation-audio-grid">
                    {(
                      [
                        ['OPENING', 'Başlangıç yönlendirmesi', detail.openingAudio, openingInput],
                        ['CLOSING', 'Bitiş yönlendirmesi', detail.closingAudio, closingInput],
                      ] as const
                    ).map(([kind, label, asset, inputRef]) => (
                      <article key={kind}>
                        <div className="meditation-audio-icon">
                          <FileAudio aria-hidden="true" />
                        </div>
                        <div>
                          <span>{label}</span>
                          <strong>{asset?.filename ?? 'Dosya yüklenmedi'}</strong>
                          <small>
                            {asset
                              ? `${formatBytes(asset.byteSize)} · ${formatAudioDuration(asset.durationSeconds)}`
                              : kind === 'CLOSING'
                                ? 'İsteğe bağlı'
                                : guidanceMode === 'GUIDED'
                                  ? 'Sesli modda yayınlamak için gerekli'
                                  : 'İsteğe bağlı'}
                          </small>
                        </div>
                        {asset ? (
                          <audio
                            controls
                            preload="none"
                            src={`${api}/v1/admin/meditations/${detail.id}/audio/${asset.id}`}
                          />
                        ) : null}
                        <input
                          ref={inputRef}
                          type="file"
                          accept=".mp3,.m4a,audio/mpeg,audio/mp4"
                          onChange={(event) =>
                            void uploadAudio(kind, event.currentTarget.files?.[0])
                          }
                        />
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => inputRef.current?.click()}
                        >
                          <Upload aria-hidden="true" /> {asset ? 'Değiştir' : 'Ses yükle'}
                        </Button>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="meditation-render-section">
                  <header>
                    <div>
                      <span>HAZIRLANAN DOSYALAR</span>
                      <h3>Süre versiyonları</h3>
                    </div>
                    <small>Ses revizyonu v{detail.audioRevision}</small>
                  </header>
                  {!detail.openingAudio ? (
                    <Alert tone="info">
                      {guidanceMode === 'SILENT'
                        ? 'Sessiz sayaç modunda süre dosyası gerekmez.'
                        : 'Dosya üretmek için başlangıç yönlendirmesi yükleyin.'}
                    </Alert>
                  ) : currentRenders.length === 0 ? (
                    <Alert tone="info">Seçili süreler kaydedildiğinde dosyalar hazırlanacak.</Alert>
                  ) : (
                    <div className="meditation-render-list">
                      {currentRenders.map((render) => (
                        <article key={render.id}>
                          <div className="meditation-render-duration">
                            <Clock3 aria-hidden="true" />
                            <strong>{render.durationMinutes}</strong>
                            <span>dakika</span>
                          </div>
                          <div className="meditation-render-state">
                            <Badge tone={renderTone(render.status)}>
                              {renderLabel(render.status)}
                            </Badge>
                            <small>
                              {render.status === 'FAILED'
                                ? render.errorCode
                                : render.status === 'READY'
                                  ? `${formatBytes(render.byteSize)} · ${render.attempts} işlem`
                                  : 'Worker sırasında'}
                            </small>
                          </div>
                          {render.status === 'READY' ? (
                            <audio
                              controls
                              preload="none"
                              src={`${api}/v1/admin/meditations/${detail.id}/renders/${render.id}/audio`}
                            />
                          ) : render.status === 'FAILED' ? (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void retryRender(render.id)}
                            >
                              <RotateCcw aria-hidden="true" /> Yeniden dene
                            </Button>
                          ) : (
                            <span className="meditation-render-pending">
                              <RefreshCw aria-hidden="true" /> İşleniyor
                            </span>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {publicShareOpen ? (
                  <Modal
                    onClose={() => setPublicShareOpen(false)}
                    title="Herkese açık paylaşım"
                    description="Instagram ve diğer kanallarda paylaşılabilen global meditasyon bağlantısını yönetin."
                    actions={
                      detail.status === 'PUBLISHED' ? (
                        <>
                          {publicShare ? (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() =>
                                void changePublicShareStatus(
                                  publicShare.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                                )
                              }
                            >
                              {publicShare.status === 'ACTIVE' ? 'Yayını durdur' : 'Yayını aç'}
                            </Button>
                          ) : null}
                          <Button loading={busy} onClick={() => void savePublicShare()}>
                            <Save aria-hidden="true" />
                            {publicShare ? 'Paylaşımı kaydet' : 'Global bağlantı oluştur'}
                          </Button>
                        </>
                      ) : undefined
                    }
                  >
                    <div className="reading-public-share meditation-public-dialog-content">
                      {detail.status !== 'PUBLISHED' ? (
                        <Alert tone="info">
                          Global bağlantı oluşturmak için meditasyonu yayınlayın.
                        </Alert>
                      ) : (
                        <>
                          {publicShare ? (
                            <div className="reading-public-link">
                              <div>
                                <span className="eyebrow">Global bağlantı</span>
                                <strong>{publicShare.publicUrl}</strong>
                              </div>
                              <Badge
                                tone={
                                  publicShare.effectiveStatus === 'ACTIVE' ? 'success' : 'neutral'
                                }
                              >
                                {
                                  {
                                    ACTIVE: 'Erişime açık',
                                    PAUSED: 'Durduruldu',
                                    EXPIRED: 'Süresi doldu',
                                    MEDITATION_UNAVAILABLE: 'Meditasyon yayında değil',
                                  }[publicShare.effectiveStatus]
                                }
                              </Badge>
                              <div>
                                <Button
                                  variant="secondary"
                                  title="Bağlantıyı kopyala"
                                  onClick={() => void copyPublicUrl()}
                                >
                                  <Copy aria-hidden="true" /> Kopyala
                                </Button>
                                <Button
                                  variant="secondary"
                                  title="Bağlantıyı aç"
                                  onClick={() =>
                                    window.open(publicShare.publicUrl, '_blank', 'noopener')
                                  }
                                >
                                  <ExternalLink aria-hidden="true" /> Aç
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          {publicShare ? (
                            <section className="reading-public-analytics meditation-public-analytics">
                              <header>
                                <div>
                                  <BarChart3 aria-hidden="true" />
                                  <div>
                                    <span className="eyebrow">Anonim istatistikler</span>
                                    <strong>Meditasyon performansı</strong>
                                  </div>
                                </div>
                                <small>Global bağlantı etkileşimi</small>
                              </header>
                              <div>
                                <article>
                                  <span>Tekil ziyaretçi</span>
                                  <strong>{publicShare.metrics.uniqueVisitors}</strong>
                                </article>
                                <article>
                                  <span>Başlatma</span>
                                  <strong>{publicShare.metrics.starts}</strong>
                                </article>
                                <article>
                                  <span>Tamamlama</span>
                                  <strong>{publicShare.metrics.completions}</strong>
                                </article>
                                <article>
                                  <span>Tamamlanma</span>
                                  <strong>%{publicShare.metrics.completionRate}</strong>
                                </article>
                                <article>
                                  <span>Tamamlanan süre</span>
                                  <strong>{publicShare.metrics.completedMinutes} dk</strong>
                                </article>
                                <article>
                                  <span>Yönlendirme gösterimi</span>
                                  <strong>{publicShare.metrics.ctaViews}</strong>
                                </article>
                                <article>
                                  <span>WhatsApp tıklaması</span>
                                  <strong>{publicShare.metrics.ctaClicks}</strong>
                                </article>
                                <article>
                                  <span>Tıklama oranı</span>
                                  <strong>%{publicShare.metrics.ctaClickRate}</strong>
                                </article>
                              </div>
                            </section>
                          ) : (
                            <Alert tone="info">
                              Bağlantı oluşturulduğunda meditasyon öğrenci hesabı gerektirmeden
                              açılabilir.
                            </Alert>
                          )}

                          <div className="meditation-public-settings">
                            <TextField
                              label="Bağlantı adı"
                              value={shareSlug}
                              onChange={(event) => setShareSlug(slugify(event.target.value))}
                            />
                            <label className="ui-field">
                              <span className="ui-field__label">Varsayılan süre</span>
                              <select
                                className="ui-input"
                                value={shareDefaultDuration}
                                onChange={(event) =>
                                  setShareDefaultDuration(Number(event.target.value))
                                }
                              >
                                {shareDurations.map((duration) => (
                                  <option key={duration} value={duration}>
                                    {duration} dakika
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="ui-field">
                              <span className="ui-field__label">Yayın bitişi</span>
                              <input
                                className="ui-input"
                                type="datetime-local"
                                value={shareExpiresAt}
                                onChange={(event) => setShareExpiresAt(event.target.value)}
                              />
                            </label>
                          </div>

                          <div className="meditation-public-durations">
                            <span>Yayınlanacak süreler</span>
                            <div>
                              {detail.targetDurations.map((duration) => (
                                <label key={duration}>
                                  <input
                                    type="checkbox"
                                    checked={shareDurations.includes(duration)}
                                    onChange={() =>
                                      setShareDurations((current) => {
                                        if (current.includes(duration)) {
                                          if (current.length === 1) return current;
                                          const next = current.filter((item) => item !== duration);
                                          if (duration === shareDefaultDuration)
                                            setShareDefaultDuration(next[0] ?? duration);
                                          return next;
                                        }
                                        return [...current, duration].sort((a, b) => a - b);
                                      })
                                    }
                                  />
                                  <span>{duration} dk</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="meditation-public-options">
                            <label>
                              <input
                                type="checkbox"
                                checked={shareAllowsSelection}
                                onChange={(event) => setShareAllowsSelection(event.target.checked)}
                              />
                              <span>Kullanıcı süre seçebilsin</span>
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={shareAllowsIndexing}
                                onChange={(event) => setShareAllowsIndexing(event.target.checked)}
                              />
                              <span>Arama motorları indeksleyebilsin</span>
                            </label>
                          </div>

                          {publicShare && shareAllowsSelection ? (
                            <div className="meditation-duration-links">
                              <span>Süreye özel bağlantılar</span>
                              <div>
                                {shareDurations.map((duration) => (
                                  <Button
                                    key={duration}
                                    variant="secondary"
                                    onClick={() => void copyPublicUrl(duration)}
                                  >
                                    <Copy aria-hidden="true" /> {duration} dk
                                  </Button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </Modal>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}

      {createOpen ? (
        <Modal
          onClose={() => setCreateOpen(false)}
          title="Yeni meditasyon türü"
          description="Temel bilgileri oluşturun; sesleri sonraki adımda yükleyin."
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" form="meditation-create-form" loading={busy}>
                <Plus aria-hidden="true" /> Oluştur
              </Button>
            </>
          }
        >
          <form
            id="meditation-create-form"
            className="meditation-create-form"
            onSubmit={createMeditation}
          >
            <TextField name="title" label="Meditasyon adı" required autoFocus />
            <label className="ui-field">
              <span className="ui-field__label">Kısa açıklama</span>
              <textarea className="ui-input" name="description" rows={3} />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">Seviye</span>
              <select className="ui-input" name="level" defaultValue="INTRODUCTION">
                <option value="INTRODUCTION">Başlangıç</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </select>
            </label>
            <label className="ui-field">
              <span className="ui-field__label">Oynatma biçimi</span>
              <select className="ui-input" name="guidanceMode" defaultValue="SILENT">
                <option value="SILENT">Sessiz sayaç</option>
                <option value="GUIDED">Sesli yönlendirme</option>
              </select>
            </label>
            <TextField
              label="Kapak görseli alt metni (isteğe bağlı)"
              name="coverImageAlt"
              maxLength={500}
            />
            <label className="reading-file-input">
              <Upload aria-hidden="true" />
              <span>
                <strong>Kapak görseli</strong>
                <small>JPEG, PNG veya WebP · en fazla 8 MiB · isteğe bağlı</small>
              </span>
              <input name="coverImage" type="file" accept="image/jpeg,image/png,image/webp" />
            </label>
          </form>
        </Modal>
      ) : null}

      {deleteOpen && detail ? (
        <Modal
          onClose={() => setDeleteOpen(false)}
          title="Meditasyonu sil"
          description="Bu işlem kullanılmamış meditasyonlarda kalıcıdır. Geçmiş pratiklerde kullanılmış içerikler kayıtları korumak için arşivlenir."
          actions={
            <>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
                Vazgeç
              </Button>
              <Button loading={busy} onClick={() => void removeMeditation()}>
                <Trash2 aria-hidden="true" /> Sil
              </Button>
            </>
          }
        >
          <Alert tone="warning">
            <strong>{detail.title}</strong> kütüphaneden kaldırılacak ve global bağlantısı
            kapatılacak.
          </Alert>
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

'use client';

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Modal,
  Skeleton,
  TextField,
  Toast,
} from '@meditation/ui';
import {
  Download,
  FileUp,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { DrawingEditorProps, DrawingScene } from './drawing-editor';

const DrawingEditor = dynamic<DrawingEditorProps>(
  () => import('./drawing-editor').then((module) => module.default),
  {
    ssr: false,
    loading: () => <div className="drawing-canvas-loading">Çizim alanı hazırlanıyor...</div>,
  },
);

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type DrawingSummary = {
  id: string;
  title: string;
  description?: string | null;
  byteSize: number;
  elementCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdByAdmin: { email: string };
  updatedByAdmin: { email: string };
};

type DrawingDetail = DrawingSummary & {
  storageKey: string;
  contentHash: string;
  scene: DrawingScene;
};

type Notice = { tone: 'success' | 'danger' | 'info'; text: string };

function csrfHeaders(json = false): HeadersInit {
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    credentials: 'include',
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error((payload as { message?: string }).message ?? `HTTP ${response.status}`);
  return payload as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadFilename(title: string) {
  const safe = title
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLocaleLowerCase('tr-TR');
  return `${safe || 'cizim'}.excalidraw`;
}

export default function DrawingsPage() {
  const [drawings, setDrawings] = useState<DrawingSummary[]>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<DrawingDetail>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const sceneRef = useRef<DrawingScene | undefined>(undefined);

  const loadDrawings = useCallback(async (preferredId?: string) => {
    setError(undefined);
    try {
      const result = await request<DrawingSummary[]>('/v1/admin/drawings');
      setDrawings(result);
      setSelectedId((current) => {
        const next = preferredId ?? current;
        if (next && result.some((drawing) => drawing.id === next)) return next;
        return result[0]?.id;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Çizimler yüklenemedi.');
    }
  }, []);

  const loadDrawing = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const result = await request<DrawingDetail>(`/v1/admin/drawings/${id}`);
      setDetail(result);
      setTitle(result.title);
      setDescription(result.description ?? '');
      sceneRef.current = result.scene;
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Çizim açılamadı.',
      });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadDrawings();
  }, [loadDrawings]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) setLibraryCollapsed(true);
  }, []);

  useEffect(() => {
    if (selectedId) void loadDrawing(selectedId);
    else setDetail(undefined);
  }, [loadDrawing, selectedId]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('tr-TR');
    if (!term) return drawings ?? [];
    return (drawings ?? []).filter(
      (drawing) =>
        drawing.title.toLocaleLowerCase('tr-TR').includes(term) ||
        drawing.description?.toLocaleLowerCase('tr-TR').includes(term),
    );
  }, [drawings, query]);

  async function createDrawing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextTitle = String(form.get('title') ?? '').trim();
    if (!nextTitle) return;
    setBusy(true);
    try {
      const created = await request<DrawingSummary>('/v1/admin/drawings', {
        method: 'POST',
        headers: csrfHeaders(true),
        body: JSON.stringify({
          title: nextTitle,
          description: String(form.get('description') ?? '').trim() || undefined,
        }),
      });
      setCreateOpen(false);
      setNotice({ tone: 'success', text: 'Yeni çizim oluşturuldu.' });
      await loadDrawings(created.id);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Çizim oluşturulamadı.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function uploadDrawing(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      const uploaded = await request<DrawingSummary>('/v1/admin/drawings/upload', {
        method: 'POST',
        headers: csrfHeaders(),
        body: form,
      });
      setNotice({ tone: 'success', text: `${uploaded.title} kütüphaneye eklendi.` });
      await loadDrawings(uploaded.id);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Dosya yüklenemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveDrawing() {
    if (!detail || !sceneRef.current) return;
    setBusy(true);
    try {
      await request(`/v1/admin/drawings/${detail.id}`, {
        method: 'PATCH',
        headers: csrfHeaders(true),
        body: JSON.stringify({
          expectedVersion: detail.version,
          title,
          description: description || null,
          scene: sceneRef.current,
        }),
      });
      setNotice({ tone: 'success', text: 'Çizim kaydedildi.' });
      await loadDrawings(detail.id);
      await loadDrawing(detail.id);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Çizim kaydedilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  function downloadDrawing() {
    if (!detail || !sceneRef.current) return;
    const blob = new Blob([JSON.stringify(sceneRef.current, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadFilename(title || detail.title);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function deleteDrawing() {
    if (!detail) return;
    setBusy(true);
    try {
      await request(`/v1/admin/drawings/${detail.id}`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      });
      setDeleteOpen(false);
      setDetail(undefined);
      setSelectedId(undefined);
      setNotice({ tone: 'success', text: 'Çizim silindi.' });
      await loadDrawings();
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Çizim silinemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="content drawing-workspace">
      <header className="drawing-workspace-header">
        <div className="drawing-workspace-title">
          <Button
            size="icon"
            variant="ghost"
            title={libraryCollapsed ? 'Kütüphaneyi aç' : 'Kütüphaneyi kapat'}
            aria-label={libraryCollapsed ? 'Kütüphaneyi aç' : 'Kütüphaneyi kapat'}
            onClick={() => setLibraryCollapsed((current) => !current)}
          >
            {libraryCollapsed ? (
              <PanelLeftOpen size={17} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={17} aria-hidden="true" />
            )}
          </Button>
          <h1>Çizimler</h1>
          <span>{drawings?.length ?? 0}</span>
        </div>
        <div className="drawing-workspace-actions">
          <input
            ref={fileInput}
            type="file"
            accept=".excalidraw,application/json"
            hidden
            onChange={(event) => void uploadDrawing(event)}
          />
          <Button
            size="icon"
            variant="secondary"
            disabled={busy}
            title="Excalidraw dosyası yükle"
            aria-label="Excalidraw dosyası yükle"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={17} aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            title="Yeni çizim"
            aria-label="Yeni çizim"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={17} aria-hidden="true" />
          </Button>
        </div>
      </header>

      {error ? (
        <Alert tone="danger" title="Çizim kütüphanesi açılamadı">
          {error}
        </Alert>
      ) : null}

      <section className="drawing-library" data-list-collapsed={libraryCollapsed}>
        <aside className="drawing-list-panel">
          <div className="drawing-list-heading">
            <strong>Kütüphane</strong>
            <span>{drawings?.length ?? 0}</span>
            <Button
              size="icon"
              variant="ghost"
              title="Listeyi yenile"
              aria-label="Listeyi yenile"
              onClick={() => void loadDrawings()}
            >
              <RefreshCw size={16} aria-hidden="true" />
            </Button>
          </div>
          <label className="drawing-search">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Çizim ara"
              aria-label="Çizim ara"
            />
          </label>

          <div className="drawing-list">
            {!drawings ? (
              <>
                <Skeleton className="drawing-list-skeleton" />
                <Skeleton className="drawing-list-skeleton" />
                <Skeleton className="drawing-list-skeleton" />
              </>
            ) : filtered.length ? (
              filtered.map((drawing) => (
                <button
                  key={drawing.id}
                  type="button"
                  className="drawing-list-item"
                  data-active={selectedId === drawing.id || undefined}
                  onClick={() => setSelectedId(drawing.id)}
                >
                  <span className="drawing-list-icon">
                    <FileUp aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{drawing.title}</strong>
                    <small>
                      {drawing.elementCount} öğe · {formatDate(drawing.updatedAt)}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <EmptyState
                title={query ? 'Eşleşen çizim yok' : 'Henüz çizim yok'}
                description={
                  query
                    ? 'Arama ifadesini değiştirin.'
                    : 'Boş bir tuval oluşturun veya Excalidraw dosyanızı yükleyin.'
                }
                action={
                  !query ? (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus size={15} aria-hidden="true" />
                      Yeni çizim
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        </aside>

        <section className="drawing-editor-panel">
          {loadingDetail ? (
            <div className="drawing-detail-loading">
              <Skeleton />
              <Skeleton />
              <Skeleton className="drawing-canvas-skeleton" />
            </div>
          ) : detail ? (
            <>
              <div className="drawing-editor-toolbar">
                <div className="drawing-title-fields">
                  <input
                    className="ui-input"
                    aria-label="Çizim adı"
                    title="Çizim adı"
                    value={title}
                    maxLength={160}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <input
                    className="ui-input"
                    aria-label="Kısa not"
                    title="Kısa not"
                    value={description}
                    maxLength={1_000}
                    placeholder="Kısa not"
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="drawing-actions">
                  <Button
                    size="icon"
                    variant="secondary"
                    title="Excalidraw dosyasını indir"
                    aria-label="Excalidraw dosyasını indir"
                    onClick={downloadDrawing}
                  >
                    <Download size={17} aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="danger"
                    title="Çizimi sil"
                    aria-label="Çizimi sil"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </Button>
                  <Button loading={busy} onClick={() => void saveDrawing()}>
                    <Save size={17} aria-hidden="true" />
                    Kaydet
                  </Button>
                </div>
              </div>

              <DrawingEditor
                key={`${detail.id}:${detail.version}`}
                drawingId={detail.id}
                scene={detail.scene}
                onChange={(scene) => {
                  sceneRef.current = scene;
                }}
              />

              <footer className="drawing-meta">
                <span>
                  <strong>Sürüm {detail.version}</strong>
                  {formatBytes(detail.byteSize)} · {detail.elementCount} öğe
                </span>
                <span>
                  Son kayıt {formatDate(detail.updatedAt)} · {detail.updatedByAdmin.email}
                </span>
                <Badge tone="success">Özel depolama</Badge>
              </footer>
            </>
          ) : (
            <EmptyState
              title="Bir çizim seçin"
              description="Kütüphaneden bir çizim açın veya yeni bir tuval oluşturun."
              icon={FileUp}
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus size={16} aria-hidden="true" />
                  Yeni çizim
                </Button>
              }
            />
          )}
        </section>
      </section>

      {createOpen ? (
        <Modal title="Yeni çizim" onClose={() => setCreateOpen(false)}>
          <form className="modal-form" onSubmit={(event) => void createDrawing(event)}>
            <TextField
              label="Çizim adı"
              name="title"
              required
              maxLength={160}
              placeholder="Örn. Nefes farkındalığı"
            />
            <label className="ui-field">
              <span className="ui-field__label">Kısa not</span>
              <textarea
                className="ui-input ui-textarea"
                name="description"
                maxLength={1_000}
                placeholder="Bu çizimin kullanım amacını not edin"
              />
            </label>
            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" loading={busy}>
                <Plus size={16} aria-hidden="true" />
                Oluştur
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleteOpen ? (
        <Modal title="Çizimi sil" onClose={() => setDeleteOpen(false)}>
          <div className="modal-form">
            <Alert tone="warning" title="Bu işlem geri alınamaz">
              “{detail?.title}” çizimi özel depolama ve kütüphaneden kalıcı olarak silinecek.
            </Alert>
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                Vazgeç
              </Button>
              <Button variant="danger" loading={busy} onClick={() => void deleteDrawing()}>
                <Trash2 size={16} aria-hidden="true" />
                Çizimi sil
              </Button>
            </div>
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
